import { supabaseAdmin } from "./supabase/admin";

export type State = "new" | "unseen" | "opened" | "clicked" | "reply_waiting" | "replied" | "booked" | "cold" | "bounced";

export const STATE_LABEL: Record<State, string> = {
  new: "Not contacted",
  unseen: "Delivered, unseen",
  opened: "Opened, no click",
  clicked: "Clicked, not booked",
  reply_waiting: "Replied, awaiting our answer",
  replied: "In conversation",
  booked: "Booked",
  cold: "Gone cold",
  bounced: "Bounced or blocked",
};

/** Rule-based playbook shown to humans now, and used as guidance for the AI agent when it is switched on. */
export const PLAYBOOK: Record<State, { why: string; do: string }> = {
  new: { why: "No outreach yet.", do: "Enrol in the lead welcome automation." },
  unseen: { why: "Delivered but no open or read. Subject line or timing missed, or it landed in promotions.", do: "Resend with a new subject line after 2 days, or try the other channel (WhatsApp if email, email if WhatsApp)." },
  opened: { why: "They saw it and were curious but not convinced enough to click. Usually the offer or the call to action was unclear, or it was the wrong moment.", do: "Send a shorter follow-up with a single question that is easy to answer, then one link." },
  clicked: { why: "Strong interest but friction at the booking step: time, price worry or unclear next step.", do: "Offer to book it for them, name two time slots, and address the likely objection (cost, time, switching agency)." },
  reply_waiting: { why: "They replied and are waiting on us.", do: "Answer today. Ask one discovery question (goal, budget, timeline, current provider) and suggest a call." },
  replied: { why: "Live conversation.", do: "Keep qualifying. If a service need is clear, propose the next rung on the offer ladder." },
  booked: { why: "Meeting booked.", do: "Send a prep message and a reminder; follow up after the call." },
  cold: { why: "Three or more touches with no engagement.", do: "Send a short breakup message that leaves the door open, then pause for 60 days." },
  bounced: { why: "Address invalid or complaint.", do: "Do not email. Try WhatsApp or find a new address." },
};

type Msg = { id: string; contact_id: string; channel: string; direction: string; status: string; subject: string | null; created_at: string };
type Ev = { message_id: string | null; contact_id: string; type: string; machine: boolean; created_at: string };
type Contact = { id: string; first_name: string | null; last_name: string | null; email: string | null; company: string | null; tags: string[] | null; email_opt_out: boolean };

export type Row = { contact: Contact; state: State; score: number; lastTouch: string | null; sent: number; opens: number; clicks: number; replies: number };

export async function loadEngagement(wsId: string, days = 90) {
  const db = supabaseAdmin();
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const [{ data: m }, { data: e }, { data: c }] = await Promise.all([
    db.from("messages").select("id,contact_id,channel,direction,status,subject,created_at").eq("workspace_id", wsId).gte("created_at", since).limit(20000),
    db.from("message_events").select("message_id,contact_id,type,machine,created_at").eq("workspace_id", wsId).gte("created_at", since).limit(50000),
    db.from("contacts").select("id,first_name,last_name,email,company,tags,email_opt_out").eq("workspace_id", wsId).limit(20000),
  ]);
  return { msgs: (m ?? []) as Msg[], events: (e ?? []) as Ev[], contacts: (c ?? []) as Contact[] };
}

export function analyse(msgs: Msg[], events: Ev[], contacts: Contact[]) {
  const byContactMsgs = new Map<string, Msg[]>();
  for (const x of msgs) (byContactMsgs.get(x.contact_id) ?? byContactMsgs.set(x.contact_id, []).get(x.contact_id)!).push(x);
  const byContactEv = new Map<string, Ev[]>();
  for (const x of events) (byContactEv.get(x.contact_id) ?? byContactEv.set(x.contact_id, []).get(x.contact_id)!).push(x);

  const rows: Row[] = contacts.map((c) => {
    const ms = (byContactMsgs.get(c.id) ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at));
    const evs = byContactEv.get(c.id) ?? [];
    const out = ms.filter((x) => x.direction === "out" && x.status !== "failed" && x.status !== "queued");
    const inb = ms.filter((x) => x.direction === "in");
    const lastOut = out.at(-1);
    const lastIn = inb.at(-1);
    const real = evs.filter((x) => !x.machine);
    const opens = real.filter((x) => x.type === "opened" || x.type === "read").length;
    const clicks = real.filter((x) => x.type === "clicked").length;
    const bounced = evs.some((x) => x.type === "bounced" || x.type === "complained") || c.email_opt_out;
    const booked = (c.tags ?? []).includes("booked");
    let state: State;
    if (booked) state = "booked";
    else if (lastIn && (!lastOut || lastIn.created_at > lastOut.created_at)) state = "reply_waiting";
    else if (lastIn) state = "replied";
    else if (bounced) state = "bounced";
    else if (!lastOut) state = "new";
    else if (clicks > 0) state = "clicked";
    else if (opens > 0) state = "opened";
    else if (out.length >= 3) state = "cold";
    else state = "unseen";
    const score = Math.min(100, inb.length * 40 + clicks * 20 + opens * 5 + (booked ? 30 : 0) - (bounced ? 50 : 0));
    return { contact: c, state, score, lastTouch: ms.at(-1)?.created_at ?? null, sent: out.length, opens, clicks, replies: inb.length };
  });

  // Per channel funnel on messages sent
  const funnel = (channel: string) => {
    const out = msgs.filter((x) => x.direction === "out" && x.channel === channel && x.status !== "failed" && x.status !== "queued");
    const ids = new Set(out.map((x) => x.id));
    const ev = (t: string[]) => new Set(events.filter((x) => x.message_id && ids.has(x.message_id) && t.includes(x.type) && !x.machine).map((x) => x.message_id));
    const delivered = new Set(events.filter((x) => x.message_id && ids.has(x.message_id) && x.type === "delivered").map((x) => x.message_id));
    const replied = out.filter((o) => msgs.some((i) => i.direction === "in" && i.contact_id === o.contact_id && i.created_at > o.created_at && Date.parse(i.created_at) - Date.parse(o.created_at) < 7 * 864e5)).length;
    return { sent: out.length, delivered: Math.max(delivered.size, out.filter((x) => x.status === "delivered").length), opened: ev(["opened", "read"]).size, clicked: ev(["clicked"]).size, replied, failed: msgs.filter((x) => x.direction === "out" && x.channel === channel && x.status === "failed").length };
  };

  // Subject line leaderboard (email)
  const subj = new Map<string, { sent: number; opened: number; clicked: number }>();
  for (const x of msgs.filter((m) => m.direction === "out" && m.channel === "email" && m.subject && m.status !== "failed")) {
    const r = subj.get(x.subject!) ?? { sent: 0, opened: 0, clicked: 0 };
    r.sent++;
    if (events.some((e) => e.message_id === x.id && e.type === "opened" && !e.machine)) r.opened++;
    if (events.some((e) => e.message_id === x.id && e.type === "clicked" && !e.machine)) r.clicked++;
    subj.set(x.subject!, r);
  }
  const states = new Map<State, number>();
  for (const r of rows) states.set(r.state, (states.get(r.state) ?? 0) + 1);
  return {
    rows,
    states,
    email: funnel("email"),
    whatsapp: funnel("whatsapp"),
    sms: funnel("sms"),
    subjects: [...subj.entries()].map(([subject, v]) => ({ subject, ...v })).sort((a, b) => b.clicked - a.clicked || b.opened - a.opened).slice(0, 10),
  };
}

export const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "n/a");
