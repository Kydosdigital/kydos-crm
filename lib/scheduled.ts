import { supabaseAdmin } from "./supabase/admin";
import { audience, deliver, type Channel } from "./campaign";
import { fireTrigger } from "./automation";
import { logActivity } from "./log";

/** Send only scheduled campaigns whose ENTIRE eligible audience fits the legacy cap.
 * Larger or unverifiable audiences are safety-cancelled without a partial send.
 * Durable multi-batch delivery will replace this temporary guard.
 */
export async function processScheduledSends() {
  const db = supabaseAdmin();
  const { data: due } = await db.from("scheduled_sends").select("*").eq("status", "scheduled").lte("send_at", new Date().toISOString()).limit(3);
  let total = 0;
  for (const s of due ?? []) {
    const { data: claimed, error: claimError } = await db.from("scheduled_sends")
      .update({ status: "sending" })
      .eq("id", s.id).eq("workspace_id", s.workspace_id).eq("status", "scheduled")
      .select("id");
    if (claimError) {
      console.error("Scheduled campaign could not be claimed", s.id, claimError);
      continue;
    }
    if (!claimed?.length) continue;
    const { data: ws, error: wsError } = await db.from("workspaces")
      .select("*").eq("id", s.workspace_id).maybeSingle();
    if (wsError || !ws) {
      // A missing/temporarily unreadable workspace must not leave a claimed
      // job in "sending". Cancel this run safely and require staff review.
      const { data: stopped, error: stopError } = await db.from("scheduled_sends")
        .update({ status: "cancelled", sent_count: 0 })
        .eq("id", s.id).eq("workspace_id", s.workspace_id).eq("status", "sending")
        .select("id").maybeSingle();
      if (stopError || !stopped) {
        console.error("Scheduled campaign missing-workspace stop needs manual review", s.id, wsError, stopError);
      } else {
        console.error("Scheduled campaign safety-cancelled because workspace could not be read", s.id, wsError);
      }
      continue;
    }
    const ch = (s.channel ?? "email") as Channel;
    const { people, total: eligible, incomplete } = await audience(ws.id, { tag: s.tag, listId: s.list_id }, ch);
    if (incomplete || eligible > people.length) {
      // A schedule might have grown since it was created. Never silently send
      // only the first 90/100 contacts and mark the whole campaign completed.
      // The current status constraint has no "blocked" state, so cancel safely
      // and record the actual reason in the activity log for staff review.
      const { data: stopped, error: stopError } = await db.from("scheduled_sends")
        .update({ status: "cancelled", sent_count: 0 })
        .eq("id", s.id).eq("workspace_id", ws.id).eq("status", "sending")
        .select("id").maybeSingle();
      if (stopError || !stopped) {
        // Never record "no messages sent" as an accepted safety-stop if no
        // status transition actually happened, including a concurrent change.
        console.error("Scheduled campaign safety-stop did not commit", s.id, stopError);
        continue;
      }
      await logActivity(ws.id, "scheduler", "scheduled campaign safety-cancelled", "broadcast", s.id,
        incomplete ? "Audience completeness could not be verified; no messages sent" :
        `${eligible} eligible recipients exceed single-send cap of ${people.length}; no messages sent`);
      continue;
    }
    let sent = 0;
    for (const c of people) if ((await deliver(ws, c, { channel: ch, subject: s.subject, body: s.body, wa_template: s.wa_template, wa_lang: s.wa_lang })).ok) sent++;
    const { data: committed, error: commitError } = await db.from("scheduled_sends")
      .update({ status: "sent", sent_count: sent })
      .eq("id", s.id).eq("workspace_id", ws.id).eq("status", "sending")
      .select("id").maybeSingle();
    if (commitError || !committed) {
      // Provider side effects may already have happened. Do not schedule a
      // repeat or pretend this run completed; manual reconciliation required.
      console.error("Scheduled campaign delivery checkpoint is uncertain", s.id, commitError);
      continue;
    }
    if (s.repeat && s.repeat !== "none") {
      // Queue the next occurrence. Cancelling that queued row stops the series.
      const next = new Date(s.send_at);
      if (s.repeat === "weekly") next.setUTCDate(next.getUTCDate() + 7);
      else if (s.repeat === "fortnightly") next.setUTCDate(next.getUTCDate() + 14);
      else next.setUTCMonth(next.getUTCMonth() + 1);
      const { id: _id, created_at: _c, status: _s, sent_count: _n, ...rest } = s;
      await db.from("scheduled_sends").insert({ ...rest, send_at: next.toISOString(), status: "scheduled", sent_count: 0 });
    }
    await logActivity(ws.id, "scheduler", "scheduled broadcast sent", "broadcast", s.id, `${sent} sent`);
    total += sent;
  }
  return total;
}

/**
 * Date triggers. An automation with trigger "date_reached" and config {"field":"renewal_date","offset_days":-7}
 * enrols each contact once their custom date field plus the offset is today (checked once a day, from 08:00 London).
 * Use field "birthday" or any custom date field; recurring yearly if config.yearly is "1".
 */
export async function processDateTriggers() {
  const db = supabaseAdmin();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const hour = Number(new Date().toLocaleString("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false }));
  if (hour < 8) return 0;
  const { data: autos } = await db.from("automations").select("id,workspace_id,trigger_config,last_date_check").eq("trigger_type", "date_reached").eq("active", true);
  let n = 0;
  for (const a of autos ?? []) {
    if (a.last_date_check === today) continue;
    await db.from("automations").update({ last_date_check: today }).eq("id", a.id);
    const cfg = (a.trigger_config ?? {}) as { field?: string; offset_days?: string | number; yearly?: string };
    if (!cfg.field) continue;
    const off = Number(cfg.offset_days) || 0;
    const { data: people } = await db.from("contacts").select("id,custom").eq("workspace_id", a.workspace_id);
    for (const c of people ?? []) {
      const raw = String((c.custom ?? {})[cfg.field] ?? "");
      if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) continue;
      const d = new Date(raw.slice(0, 10) + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + off);
      const hit = cfg.yearly === "1" ? d.toISOString().slice(5, 10) === today.slice(5, 10) : d.toISOString().slice(0, 10) === today;
      if (hit) { await fireTrigger(a.workspace_id, c.id, { type: "date_reached" }); n++; }
    }
  }
  return n;
}
