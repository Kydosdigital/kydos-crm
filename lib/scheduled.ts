import { supabaseAdmin } from "./supabase/admin";
import { sendEmail, render } from "./messaging";
import { matchList } from "./lists";
import { fireTrigger } from "./automation";
import { logActivity } from "./log";

/** Sends any scheduled bulk emails that are now due (capped at 90 per send to stay inside the free Resend limit). */
export async function processScheduledSends() {
  const db = supabaseAdmin();
  const { data: due } = await db.from("scheduled_sends").select("*").eq("status", "scheduled").lte("send_at", new Date().toISOString()).limit(3);
  let total = 0;
  for (const s of due ?? []) {
    const { data: claimed } = await db.from("scheduled_sends").update({ status: "sending" }).eq("id", s.id).eq("status", "scheduled").select("id");
    if (!claimed?.length) continue;
    const { data: ws } = await db.from("workspaces").select("*").eq("id", s.workspace_id).single();
    if (!ws) continue;
    let people: Awaited<ReturnType<typeof matchList>> = [];
    if (s.list_id) {
      const { data: l } = await db.from("smart_lists").select("filter").eq("id", s.list_id).single();
      people = l ? (await matchList(ws.id, l.filter)).filter((c) => c.email && !c.email_opt_out).slice(0, 90) : [];
    } else if (s.tag) {
      const r = await db.from("contacts").select("*").eq("workspace_id", ws.id).contains("tags", [s.tag]).eq("email_opt_out", false).not("email", "is", null).limit(90);
      people = (r.data ?? []) as typeof people;
    }
    let sent = 0;
    for (const c of people) if ((await sendEmail(ws, c, render(s.subject, c), render(s.body, c))).ok) sent++;
    await db.from("scheduled_sends").update({ status: "sent", sent_count: sent }).eq("id", s.id);
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
