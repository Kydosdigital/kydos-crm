import { Resend } from "resend";
import { supabaseAdmin } from "./supabase/admin";
import { brandEmail, brandText } from "./emailBrand";

const gbp = (n: number) => `£${Number(n).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
const nm = (c: { first_name: string | null; last_name: string | null; email: string | null } | null) => [c?.first_name, c?.last_name].filter(Boolean).join(" ") || c?.email || "Unknown";

/** Plain-text digest body (the branded layout turns "- " lines into bullets and "## " into headings). */
export async function buildDigest(wsId: string) {
  const db = supabaseAdmin();
  const now = Date.now(), day = 864e5;
  const since = new Date(now - day).toISOString();
  const endOfToday = new Date(); endOfToday.setUTCHours(23, 59, 59, 999);
  const [leads, msgs, tasks, calls, opps, invs, rets, props] = await Promise.all([
    db.from("contacts").select("first_name,last_name,email,source").eq("workspace_id", wsId).gte("created_at", since).limit(50),
    db.from("messages").select("contact_id,direction,created_at,channel,contacts(first_name,last_name,email)").eq("workspace_id", wsId).gte("created_at", new Date(now - 3 * day).toISOString()).order("created_at", { ascending: false }).limit(1000),
    db.from("tasks").select("title,due_at,contacts(first_name,last_name,email)").eq("workspace_id", wsId).eq("done", false).lte("due_at", endOfToday.toISOString()).order("due_at").limit(30),
    db.from("call_logs").select("from_number,status,contacts(first_name,last_name,email)").eq("workspace_id", wsId).eq("direction", "in").gte("created_at", since).in("status", ["no-answer", "missed", "busy", "failed"]).limit(20),
    db.from("opportunities").select("value").eq("workspace_id", wsId).eq("status", "open"),
    db.from("invoices").select("number,amount_gbp,due_date,contacts(first_name,last_name,email)").eq("workspace_id", wsId).eq("kind", "invoice").eq("status", "sent").lt("due_date", new Date().toISOString().slice(0, 10)).limit(20),
    db.from("retainers").select("amount_gbp,status,contacts(first_name,last_name,email)").eq("workspace_id", wsId).in("status", ["active", "past_due"]),
    db.from("proposals").select("title,contacts(first_name,last_name,email)").eq("workspace_id", wsId).eq("status", "viewed"),
  ]);
  // Unanswered: the newest message in the last 3 days for a contact is inbound.
  const latest = new Map<string, { direction: string; channel: string; who: string }>();
  for (const m of (msgs.data ?? []) as unknown as { contact_id: string; direction: string; channel: string; contacts: { first_name: string | null; last_name: string | null; email: string | null } | null }[]) {
    if (!latest.has(m.contact_id)) latest.set(m.contact_id, { direction: m.direction, channel: m.channel, who: nm(m.contacts) });
  }
  const waiting = [...latest.values()].filter((x) => x.direction === "in");
  const L: string[] = [];
  const sec = (title: string, items: string[], empty?: string) => { if (items.length) L.push(`## ${title}`, items.map((i) => `- ${i}`).join("\n")); else if (empty) L.push(`## ${title}`, empty); };
  sec("Needs a reply", waiting.map((w) => `${w.who} (${w.channel})`), "Nobody is waiting on you.");
  sec("Tasks due today or overdue", ((tasks.data ?? []) as unknown as { title: string; due_at: string | null; contacts: { first_name: string | null; last_name: string | null; email: string | null } | null }[]).map((t) => `${t.title}${t.contacts ? ` (${nm(t.contacts)})` : ""}${t.due_at && Date.parse(t.due_at) < now - day ? " OVERDUE" : ""}`), "No tasks due.");
  sec("New leads in the last 24 hours", ((leads.data ?? []) as { first_name: string | null; last_name: string | null; email: string | null; source: string | null }[]).slice(0, 10).map((c) => `${nm(c)}${c.source ? ` via ${c.source}` : ""}`), "No new leads.");
  sec("Missed calls", ((calls.data ?? []) as unknown as { from_number: string | null; contacts: { first_name: string | null; last_name: string | null; email: string | null } | null }[]).map((c) => c.contacts ? nm(c.contacts) : c.from_number ?? "Unknown"));
  sec("Overdue invoices", ((invs.data ?? []) as unknown as { number: string; amount_gbp: number; due_date: string; contacts: { first_name: string | null; last_name: string | null; email: string | null } | null }[]).map((i) => `${i.number} ${gbp(i.amount_gbp)} from ${nm(i.contacts)}, due ${i.due_date}`));
  const failing = ((rets.data ?? []) as unknown as { status: string; contacts: { first_name: string | null; last_name: string | null; email: string | null } | null }[]).filter((r) => r.status === "past_due");
  sec("Retainer payments failing", failing.map((r) => nm(r.contacts)));
  sec("Proposals opened, not yet accepted", ((props.data ?? []) as unknown as { title: string; contacts: { first_name: string | null; last_name: string | null; email: string | null } | null }[]).map((p) => `${p.title} (${nm(p.contacts)})`));
  const pipe = (opps.data ?? []).reduce((a, o) => a + Number(o.value ?? 0), 0);
  const mrr = ((rets.data ?? []) as { amount_gbp: number }[]).reduce((a, r) => a + Number(r.amount_gbp), 0);
  L.push("## Numbers", `- Open pipeline: ${gbp(pipe)} across ${(opps.data ?? []).length} deals\n- Monthly recurring revenue: ${gbp(mrr)}`);
  return { text: L.join("\n\n"), waiting: waiting.length, tasks: (tasks.data ?? []).length };
}

/** Emails each workspace a morning digest once a day from 07:30 London time. */
export async function dailyDigestIfDue() {
  const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/London" }).formatToParts(new Date());
  const hr = Number(parts.find((p) => p.type === "hour")?.value), min = Number(parts.find((p) => p.type === "minute")?.value);
  if (hr < 7 || (hr === 7 && min < 30)) return 0;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const db = supabaseAdmin();
  const { data: wss } = await db.from("workspaces").select("*").eq("daily_digest", true);
  let n = 0;
  for (const ws of wss ?? []) {
    if (!ws.notify_email || !ws.email_from || ws.last_digest_date === today) continue;
    const { data: claimed } = await db.from("workspaces").update({ last_digest_date: today }).eq("id", ws.id).or(`last_digest_date.is.null,last_digest_date.neq.${today}`).select("id");
    if (!claimed?.length) continue;
    const d = await buildDigest(ws.id);
    const body = `Good morning. Here is your day at a glance.\n\n${d.text}\n\n[button: Open the CRM | ${process.env.NEXT_PUBLIC_APP_URL}/contacts]`;
    try {
      await new Resend(process.env.RESEND_API_KEY).emails.send({
        from: ws.email_from, to: ws.notify_email,
        subject: `${ws.name} daily digest: ${d.waiting} awaiting reply, ${d.tasks} tasks`,
        html: brandEmail(ws, body), text: brandText(ws, body),
      });
      n++;
    } catch (e) { console.error("digest failed", e); }
  }
  return n;
}
