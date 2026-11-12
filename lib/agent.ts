import { supabaseAdmin } from "./supabase/admin";
import { analyse, loadEngagement, PLAYBOOK, STATE_LABEL, type State } from "./engagement";
import { sendEmail, sendSms } from "./messaging";
import { sendFromOutlook } from "./outlook";
import { sendWhatsAppText } from "./whatsapp";

// The communications agent. Everything here is built, but nothing calls the model unless
// ANTHROPIC_API_KEY is set AND the workspace agent_mode is not "off". Drafts always land in the approval queue
// unless agent_mode is "auto", and replies from contacts always wait for a human.

export const agentAvailable = () => !!process.env.ANTHROPIC_API_KEY;

type Ws = { id: string; name: string; email_from: string | null; sms_from: string | null; whatsapp_from: string | null; business_address: string | null; agent_mode: string };

const inQuietHours = () => {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/London" }).format(new Date()));
  return h < 8 || h >= 20;
};

export async function draftFor(ws: Ws, contactId: string, state: State) {
  if (!agentAvailable()) return { ok: false as const, error: "No ANTHROPIC_API_KEY set, agent is paused" };
  const db = supabaseAdmin();
  const [{ data: contact }, { data: kb }, { data: msgs }, { data: events }] = await Promise.all([
    db.from("contacts").select("*").eq("id", contactId).single(),
    db.from("knowledge_items").select("kind,title,body").eq("workspace_id", ws.id).eq("active", true),
    db.from("messages").select("channel,direction,subject,body,status,created_at").eq("contact_id", contactId).order("created_at", { ascending: false }).limit(12),
    db.from("message_events").select("type,url,machine,created_at").eq("contact_id", contactId).order("created_at", { ascending: false }).limit(20),
  ]);
  if (!contact) return { ok: false as const, error: "Contact not found" };
  const channel = contact.phone && (msgs ?? []).some((m) => m.channel === "whatsapp" && m.direction === "in") ? "whatsapp" : contact.email ? "email" : "whatsapp";

  const system = `You are the sales communications agent for ${ws.name}, a UK digital marketing agency. You write emails and WhatsApp messages that move a lead towards booking a call.
Rules: British spelling, no em dashes, warm and direct, short (email under 120 words, WhatsApp under 60). One clear call to action per message. Ask one discovery question when it helps (goal, budget, timeline, current provider). Look for upsell and cross-sell chances from the offer ladder. Never invent prices, results or services that are not in the knowledge base. Never pressure or mislead. If the contact asks for pricing disputes, complaints or legal matters, set escalate to true.
Return ONLY JSON: {"hypothesis": string, "tactic": string, "subject": string|null, "body": string, "escalate": boolean}`;
  const user = `KNOWLEDGE BASE\n${(kb ?? []).map((k) => `[${k.kind}] ${k.title}: ${k.body}`).join("\n") || "(empty)"}

CONTACT: ${[contact.first_name, contact.last_name, contact.company, contact.email].filter(Boolean).join(", ")}; tags: ${(contact.tags ?? []).join(", ")}
ENGAGEMENT STATE: ${STATE_LABEL[state]}. Playbook hint: ${PLAYBOOK[state].why} ${PLAYBOOK[state].do}
RECENT EVENTS (newest first): ${JSON.stringify(events ?? [])}
CONVERSATION (newest first): ${JSON.stringify(msgs ?? [])}
Preferred channel: ${channel}. Write the next message.`;

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: process.env.AGENT_MODEL ?? "claude-sonnet-5-5", max_tokens: 1200, system, messages: [{ role: "user", content: user }] }),
  });
  const j = await r.json();
  if (!r.ok) return { ok: false as const, error: j?.error?.message ?? `Anthropic ${r.status}` };
  const raw: string = j.content?.[0]?.text ?? "";
  let out: { hypothesis: string; tactic: string; subject: string | null; body: string; escalate: boolean };
  try { out = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)); } catch { return { ok: false as const, error: "Model returned invalid JSON" }; }
  const { data: d } = await db.from("agent_drafts").insert({
    workspace_id: ws.id, contact_id: contactId, channel, subject: out.subject, body: out.body, state,
    hypothesis: out.hypothesis, tactic: out.tactic, source: "ai", status: "pending",
  }).select("id").single();
  return { ok: true as const, id: d?.id as string, escalate: out.escalate };
}

export async function sendDraft(wsRow: Ws, draftId: string) {
  const db = supabaseAdmin();
  const { data: d } = await db.from("agent_drafts").select("*").eq("id", draftId).single();
  if (!d || d.status === "sent") return { ok: false as const, error: "Draft not found or already sent" };
  const { data: c } = await db.from("contacts").select("*").eq("id", d.contact_id).single();
  if (!c) return { ok: false as const, error: "Contact not found" };
  let res: { ok: boolean; error?: string };
  if (d.channel === "email") {
    const { data: conn } = await db.from("mail_connections").select("workspace_id").eq("workspace_id", wsRow.id).maybeSingle();
    const subject = d.subject ?? `A note from ${wsRow.name}`;
    res = conn ? await sendFromOutlook(wsRow, c, subject, d.body) : await sendEmail(wsRow, c, subject, d.body);
  } else if (d.channel === "whatsapp") res = await sendWhatsAppText(wsRow, c, d.body);
  else res = await sendSms(wsRow, c, d.body);
  await db.from("agent_drafts").update({ status: res.ok ? "sent" : "failed", error: res.ok ? null : res.error, decided_at: new Date().toISOString() }).eq("id", draftId);
  return res;
}

/** Scheduled sweep: finds contacts who need a nudge and drafts for them. Does nothing unless the agent is on and a key exists. */
export async function agentSweep() {
  if (!agentAvailable() || inQuietHours()) return { drafted: 0, sent: 0 };
  const db = supabaseAdmin();
  const { data: list } = await db.from("workspaces").select("*").neq("agent_mode", "off");
  let drafted = 0, sent = 0;
  for (const ws of (list ?? []) as Ws[]) {
    const { msgs, events, contacts } = await loadEngagement(ws.id, 60);
    const { rows } = analyse(msgs, events, contacts);
    const { data: recent } = await db.from("agent_drafts").select("contact_id,status,created_at").eq("workspace_id", ws.id).gte("created_at", new Date(Date.now() - 3 * 864e5).toISOString());
    const blocked = new Set((recent ?? []).map((x) => x.contact_id));
    const due = rows
      .filter((r) => ["reply_waiting", "opened", "clicked", "unseen", "cold"].includes(r.state) && !blocked.has(r.contact.id) && !r.contact.email_opt_out)
      .filter((r) => r.state === "reply_waiting" || (r.lastTouch && Date.now() - Date.parse(r.lastTouch) > 2 * 864e5))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    for (const r of due) {
      const res = await draftFor(ws, r.contact.id, r.state);
      if (!res.ok) break;
      drafted++;
      if (ws.agent_mode === "auto" && r.state !== "reply_waiting" && !res.escalate && res.id) {
        const s = await sendDraft(ws, res.id);
        if (s.ok) sent++;
      }
    }
  }
  return { drafted, sent };
}
