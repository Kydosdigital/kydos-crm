import { supabaseAdmin } from "./supabase/admin";
import { analyse, loadEngagement, pct, STATE_LABEL } from "./engagement";
import { notifyOwner } from "./notify";

export async function buildReport(wsId: string, days = 7) {
  const { msgs, events, contacts } = await loadEngagement(wsId, days);
  const a = analyse(msgs, events, contacts);
  const line = (n: string, f: typeof a.email) => `${n}: ${f.sent} sent, ${pct(f.delivered, f.sent)} delivered, ${pct(f.opened, f.sent)} opened/read, ${pct(f.clicked, f.sent)} clicked, ${pct(f.replied, f.sent)} replied, ${f.failed} failed`;
  const hot = a.rows.filter((r) => r.score > 0).sort((x, y) => y.score - x.score).slice(0, 10);
  const booked = a.rows.filter((r) => r.state === "booked").length;
  return [
    `Last ${days} days`,
    "",
    line("Email", a.email),
    line("WhatsApp", a.whatsapp),
    line("SMS", a.sms),
    "",
    `Bookings (tagged booked): ${booked}`,
    "",
    "Where your contacts are now:",
    ...[...a.states.entries()].map(([s, n]) => `  ${STATE_LABEL[s]}: ${n}`),
    "",
    "Hot leads:",
    ...(hot.length ? hot.map((r) => `  ${[r.contact.first_name, r.contact.last_name].filter(Boolean).join(" ") || r.contact.email} (${STATE_LABEL[r.state]}, score ${r.score})`) : ["  none yet"]),
    "",
    "Best subject lines:",
    ...(a.subjects.length ? a.subjects.slice(0, 5).map((s) => `  "${s.subject}": ${s.sent} sent, ${s.opened} opened, ${s.clicked} clicked`) : ["  none yet"]),
    "",
    "Note: email opens are indicative only (mail privacy features pre-load images). Clicks and replies are the reliable signals.",
  ].join("\n");
}

/** Sends the weekly report on Monday morning (London) once per week. Called from the 5 minute cron. */
export async function weeklyReportIfDue() {
  const now = new Date();
  const p = new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "numeric", hour12: false, timeZone: "Europe/London" }).formatToParts(now);
  const wd = p.find((x) => x.type === "weekday")?.value, hr = Number(p.find((x) => x.type === "hour")?.value);
  if (wd !== "Mon" || hr < 8) return 0;
  const db = supabaseAdmin();
  const { data } = await db.from("workspaces").select("id,name,last_report_at,notify_email");
  let n = 0;
  for (const w of data ?? []) {
    if (!w.notify_email) continue;
    if (w.last_report_at && Date.now() - Date.parse(w.last_report_at) < 6 * 864e5) continue;
    await db.from("workspaces").update({ last_report_at: now.toISOString() }).eq("id", w.id);
    await notifyOwner(w.id, `${w.name}: weekly communications report`, await buildReport(w.id));
    n++;
  }
  return n;
}
