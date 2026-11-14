/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "./supabase/admin";
import { render as baseRender, sendEmail, sendSms, unsubToken } from "./messaging";
import { createHmac } from "crypto";
import { notifyOwner } from "./notify";
import { sendWhatsAppTemplate } from "./whatsapp";

/** Next weekday (Mon to Fri) at the given hour, London time. */
function nextWeekdayAt(hour: number) {
  const base = new Date();
  base.setMinutes(0, 0, 0);
  for (let h = 1; h <= 200; h++) {
    const t = new Date(base.getTime() + h * 3600_000);
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", hour: "numeric", hour12: false }).formatToParts(t);
    const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
    const hr = Number(parts.find((p) => p.type === "hour")?.value);
    if (!["Sat", "Sun"].includes(wd) && hr % 24 === hour) return t;
  }
  return new Date(Date.now() + 24 * 3600_000);
}

export type TriggerEvent =
  | { type: "contact_created" }
  | { type: "tag_added"; tag: string }
  | { type: "stage_changed"; stage_id: string }
  | { type: "form_submitted"; form: string }
  | { type: "booking_created" }
  | { type: "booking_cancelled" }
  | { type: "date_reached" }
  | { type: "missed_call" }
  | { type: "reply_received" }
  | { type: "email_opened" }
  | { type: "email_clicked" }
  | { type: "invoice_paid" }
  | { type: "deal_won" }
  | { type: "deal_lost" }
  | { type: "proposal_accepted" };

/** Call whenever something happens. Enrols the contact in every matching active automation. */
export async function fireTrigger(workspaceId: string, contactId: string, ev: TriggerEvent, context: Record<string, unknown> = {}) {
  const db = supabaseAdmin();
  const { data: autos } = await db
    .from("automations")
    .select("id, trigger_config")
    .eq("workspace_id", workspaceId)
    .eq("trigger_type", ev.type)
    .eq("active", true);
  for (const a of autos ?? []) {
    const cfg = (a.trigger_config ?? {}) as Record<string, string>;
    if (ev.type === "tag_added" && cfg.tag && cfg.tag !== ev.tag) continue;
    if (ev.type === "stage_changed" && cfg.stage_id && cfg.stage_id !== ev.stage_id) continue;
    if (ev.type === "form_submitted" && cfg.form && cfg.form !== ev.form) continue;
    // Don't enrol twice in the same automation while a run is still active
    const { data: existing } = await db
      .from("automation_runs")
      .select("id")
      .eq("automation_id", a.id)
      .eq("contact_id", contactId)
      .eq("status", "active")
      .maybeSingle();
    if (existing && !context.booking_id) continue;
    // Noisy triggers: enrol a contact at most once a day per automation
    if (["email_opened", "email_clicked", "reply_received"].includes(ev.type)) {
      const { data: recent } = await db.from("automation_runs").select("id").eq("automation_id", a.id).eq("contact_id", contactId).gte("started_at", new Date(Date.now() - 864e5).toISOString()).limit(1);
      if (recent?.length) continue;
    }
    await db.from("automation_runs").insert({ workspace_id: workspaceId, automation_id: a.id, contact_id: contactId, context });
  }
}

/** Atomically claim each due run before executing any external side effect.
 * A worker crash never causes an automatic replay: an expired claim is marked
 * failed for investigation because a provider may already have accepted a send.
 * Migration 0034 must be deployed in staging and tested before deploying this code.
 */
export async function processDueRuns(limit = 50) {
  const db = supabaseAdmin();
  const { data: expired, error: expiryError } = await db.rpc("expire_stale_automation_claims");
  if (expiryError) throw new Error("Unable to quarantine stale automation claims: " + expiryError.message);
  for (const stale of expired ?? []) {
    try {
      await notifyOwner(stale.workspace_id, "Automation claim expired", "Run " + stale.run_id + " requires manual verification before retrying any step.");
    } catch (error) {
      console.error("Could not alert owner about expired automation claim", error);
    }
  }

  const seen: string[] = [];
  let processed = 0;
  // Claim ONE run at a time, so a timeout does not strand a whole 50-run batch.
  // Exclude already-processed IDs to avoid running multiple steps in one sweep.
  for (let i = 0; i < Math.min(50, Math.max(0, Math.floor(limit))); i++) {
    const { data: claimed, error: claimError } = await db.rpc("claim_due_automation_runs", {
      p_limit: 1,
      p_exclude_ids: seen,
    });
    if (claimError) throw new Error("Unable to claim due automation run: " + claimError.message);
    const run = (claimed ?? [])[0] as Run | undefined;
    if (!run) break;
    if (!run.claim_token) throw new Error("Claimed run missing ownership token: " + run.id);
    seen.push(run.id);

    try {
      await advance(run);
    } catch (error) {
      // Only the owning worker can mark its claim failed; another worker may
      // already have quarantined an expired lease. Never replay automatically.
      const { data: failed, error: markError } = await db.from("automation_runs")
        .update({
          status: "failed",
          last_error: String(error).slice(0, 2000),
          claim_token: null,
          claim_started_at: null,
          claim_expires_at: null,
        })
        .eq("id", run.id).eq("workspace_id", run.workspace_id)
        .eq("status", "active").eq("claim_token", run.claim_token)
        .select("id").maybeSingle();
      if (markError || !failed) {
        console.error("Automation claim could not be marked failed, manual review required", run.id, markError);
      } else {
        try {
          await notifyOwner(run.workspace_id, "Automation run failed", "Run " + run.id + " failed: " + String(error));
        } catch (alertError) {
          console.error("Could not alert owner about automation failure", alertError);
        }
      }
    }
    processed++;
  }
  return processed;
}

type Run = {
  id: string; workspace_id: string; automation_id: string; contact_id: string;
  step_position: number; started_at: string;
  context: Record<string, unknown> | null; wait_started_at: string | null;
  claim_token: string;
};

/** Persist a step transition only if this worker still owns the atomic claim. */
async function releaseClaim(run: Run, patch: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin().from("automation_runs")
    .update({ ...patch, claim_token: null, claim_started_at: null, claim_expires_at: null })
    .eq("id", run.id).eq("workspace_id", run.workspace_id)
    .eq("status", "active").eq("claim_token", run.claim_token)
    .select("id").maybeSingle();
  if (error || !data) throw new Error("Claimed automation step could not be committed: " + run.id);
}

const SSRF = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1)/i;

async function evalCond(raw: string, run: Run, contact: any): Promise<boolean> {
  const db = supabaseAdmin();
  const neg = raw.trim().startsWith("!");
  const cond = raw.trim().replace(/^!/, "").trim();
  let r = false;
  const [kind, ...restParts] = cond.split(":");
  const rest = restParts.join(":").trim();
  const since = run.started_at;
  if (kind === "replied") {
    const { count } = await db.from("messages").select("id", { count: "exact", head: true }).eq("contact_id", contact.id).eq("direction", "in").gte("created_at", since);
    r = (count ?? 0) > 0;
  } else if (kind === "opened" || kind === "clicked") {
    const { count } = await db.from("message_events").select("id", { count: "exact", head: true }).eq("contact_id", contact.id).eq("type", kind === "opened" ? "opened" : "clicked").eq("machine", false).gte("created_at", since);
    r = (count ?? 0) > 0;
  } else if (kind === "failed") {
    const { count } = await db.from("messages").select("id", { count: "exact", head: true }).eq("contact_id", contact.id).eq("direction", "out").eq("status", "failed").gte("created_at", since);
    r = (count ?? 0) > 0;
  } else if (kind === "tag") r = (contact.tags ?? []).includes(rest);
  else if (kind === "optedout") r = !!contact.email_opt_out;
  else if (kind === "stage") {
    const { data } = await db.from("opportunities").select("stages(name)").eq("contact_id", contact.id).eq("status", "open");
    r = (data ?? []).some((o: any) => String(o.stages?.name ?? "").toLowerCase() === rest.toLowerCase());
  } else if (kind === "field") {
    const [k, v] = rest.split("=");
    r = String(contact.custom?.[k?.trim()] ?? "").toLowerCase() === (v ?? "").trim().toLowerCase();
  } else if (kind === "booked") {
    const { count } = await db.from("bookings").select("id", { count: "exact", head: true }).eq("contact_id", contact.id).eq("status", "booked").gte("start_time", new Date().toISOString());
    r = (count ?? 0) > 0;
  } else if (kind === "booking_active" || kind === "no_show" || kind === "attended") {
    const id = run.context?.booking_id as string | undefined;
    if (id) {
      const { data } = await db.from("bookings").select("status").eq("id", id).maybeSingle();
      r = kind === "booking_active" ? data?.status === "booked" : data?.status === kind;
    }
  }
  return neg ? !r : r;
}

async function advance(run: Run) {
  const db = supabaseAdmin();
  const [{ data: step }, { data: contact }, { data: ws }, { data: automation }] = await Promise.all([
    db.from("automation_steps").select("*").eq("automation_id", run.automation_id).eq("workspace_id", run.workspace_id).eq("position", run.step_position).maybeSingle(),
    db.from("contacts").select("*").eq("id", run.contact_id).eq("workspace_id", run.workspace_id).single(),
    db.from("workspaces").select("*").eq("id", run.workspace_id).single(),
    db.from("automations").select("active").eq("id", run.automation_id).eq("workspace_id", run.workspace_id).maybeSingle(),
  ]);

  // A paused automation does not execute a new step, even if it was claimed
  // shortly before the operator switched off the workflow.
  if (automation && !automation.active) {
    await releaseClaim(run, {});
    return;
  }
  if (!step || !contact || !ws || !automation) {
    await releaseClaim(run, { status: "done" });
    return;
  }

  const cfg = (step.config ?? {}) as Record<string, string | number>;
  let nextAt = new Date();
  let stop = false;
  let jump = 1; // how many step positions to move on (skip_if etc. add more)
  let clearWaitStart = false;

  // Booking context (appointment reminders and follow-ups)
  const bookingId = run.context?.booking_id as string | undefined;
  const { data: booking } = bookingId ? await db.from("bookings").select("*").eq("id", bookingId).maybeSingle() : { data: null };
  const when = booking ? new Date(booking.start_time) : null;
  const fmt = (o: Intl.DateTimeFormatOptions) => (when ? new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", ...o }).format(when) : "");
  const extra: Record<string, string> = {
    review_link: ws.review_link ?? "",
    booking_link: ws.booking_link ?? "",
    business: ws.name,
    feedback_link: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/f/${contact.id}?t=${unsubToken(contact.id)}`,
    booking_date: fmt({ weekday: "long", day: "numeric", month: "long" }),
    booking_time: fmt({ hour: "2-digit", minute: "2-digit", hour12: false }),
  };
  const render = (t: string, c: typeof contact) => baseRender(t, c, extra);

  switch (step.type) {
    case "send_email":
      await sendEmail(ws, contact, render(String(cfg.subject ?? ""), contact), render(String(cfg.body ?? ""), contact));
      break;
    case "send_sms":
      await sendSms(ws, contact, render(String(cfg.body ?? ""), contact));
      break;
    case "add_tag":
      await db.from("contacts").update({ tags: Array.from(new Set([...(contact.tags ?? []), String(cfg.tag)])) }).eq("id", contact.id);
      break;
    case "remove_tag":
      await db.from("contacts").update({ tags: (contact.tags ?? []).filter((t: string) => t !== cfg.tag) }).eq("id", contact.id);
      break;
    case "move_stage": {
      const q = db.from("stages").select("id,pipeline_id").eq("workspace_id", ws.id);
      const { data: stage } = await (cfg.stage_id ? q.eq("id", String(cfg.stage_id)) : q.ilike("name", String(cfg.stage ?? ""))).limit(1).maybeSingle();
      if (stage) await db.from("opportunities").update({ stage_id: stage.id }).eq("contact_id", contact.id).eq("pipeline_id", stage.pipeline_id).eq("status", "open");
      break;
    }
    case "create_task":
      await db.from("tasks").insert({ workspace_id: ws.id, contact_id: contact.id, title: render(String(cfg.title ?? "Follow up"), contact) });
      break;
    case "send_whatsapp":
      await sendWhatsAppTemplate(ws, contact, String(cfg.template), ((cfg.vars as unknown as string[]) ?? []).map((v) => render(String(v), contact)), String(cfg.lang ?? "en_GB"));
      break;
    case "notify":
      await notifyOwner(ws.id, render(String(cfg.subject ?? "Automation notification"), contact), render(String(cfg.body ?? ""), contact) + `\n\nContact: ${[contact.first_name, contact.last_name, contact.email, contact.phone].filter(Boolean).join(", ")}`);
      break;
    case "create_opportunity": {
      const { data: open } = await db.from("opportunities").select("id").eq("contact_id", contact.id).eq("status", "open").limit(1);
      if (open?.length) break;
      const sq = db.from("stages").select("id,pipeline_id").eq("workspace_id", ws.id);
      const { data: stage } = await (cfg.stage ? sq.ilike("name", String(cfg.stage)) : sq.order("position")).limit(1).maybeSingle();
      if (stage) await db.from("opportunities").insert({ workspace_id: ws.id, contact_id: contact.id, pipeline_id: stage.pipeline_id, stage_id: stage.id, title: render(String(cfg.title ?? "New opportunity"), contact), value: Number(cfg.value ?? 0) || 0 });
      break;
    }
    case "enrol": {
      const { data: target } = await db.from("automations").select("id").eq("workspace_id", ws.id).ilike("name", String(cfg.automation ?? "")).maybeSingle();
      if (target) {
        const { data: active } = await db.from("automation_runs").select("id").eq("automation_id", target.id).eq("contact_id", contact.id).eq("status", "active").maybeSingle();
        if (!active) await db.from("automation_runs").insert({ workspace_id: ws.id, automation_id: target.id, contact_id: contact.id });
      }
      break;
    }
    case "wait_weekday":
      nextAt = nextWeekdayAt(Number(cfg.hour ?? 9));
      break;
    case "wait":
      nextAt = new Date(Date.now() + Number(cfg.hours ?? 24) * 3600_000);
      break;
    case "skip_if":
    case "skip_unless": {
      const ok = await evalCond(String(cfg.cond ?? ""), run, contact);
      if (step.type === "skip_if" ? ok : !ok) jump = 1 + Number(cfg.n ?? 1);
      break;
    }
    case "end":
      await releaseClaim(run, { status: "done" });
      return;
    case "wait_until": {
      if (await evalCond(String(cfg.cond ?? ""), run, contact)) {
        clearWaitStart = true;
        break; // goal reached, move on
      }
      const started = run.wait_started_at ? new Date(run.wait_started_at) : new Date();
      if (Date.now() - started.getTime() >= Number(cfg.hours ?? 24) * 3600_000) {
        clearWaitStart = true;
        break; // timed out, move on (a following skip_unless can branch on the goal)
      }
      await releaseClaim(run, { wait_started_at: started.toISOString(), next_run_at: new Date(Date.now() + 5 * 60_000).toISOString() });
      return;
    }
    case "wait_before":
    case "wait_after": {
      if (!booking || !when) { stop = true; break; }
      if (booking.status === "cancelled" && step.type === "wait_before") { stop = true; break; }
      const h = Number(cfg.hours ?? 24) * 3600_000;
      const target = new Date(step.type === "wait_before" ? when.getTime() - h : when.getTime() + h);
      if (target.getTime() <= Date.now()) {
        // already past: for reminders skip the next N steps instead of sending a stale reminder
        if (step.type === "wait_before") jump = 1 + Number(cfg.skip ?? 0);
      } else nextAt = target;
      break;
    }
    case "assign_owner": {
      const { data: mem } = await db.from("workspace_members").select("user_id").eq("workspace_id", ws.id);
      let owner: string | undefined;
      if (String(cfg.who).toLowerCase() === "round_robin") {
        // Least-loaded teammate gets the next contact, which rotates fairly over time.
        const counts = await Promise.all((mem ?? []).map(async (m) => ({ id: m.user_id as string, n: (await db.from("contacts").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id).eq("owner_id", m.user_id)).count ?? 0 })));
        owner = counts.sort((a, b) => a.n - b.n)[0]?.id;
      } else {
        const { data: users } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const u = users?.users.find((x) => x.email?.toLowerCase() === String(cfg.who).toLowerCase());
        if (u && (mem ?? []).some((m) => m.user_id === u.id)) owner = u.id;
      }
      if (owner) await db.from("contacts").update({ owner_id: owner }).eq("id", contact.id);
      break;
    }
    case "set_field": {
      const custom = { ...(contact.custom ?? {}), [String(cfg.key)]: render(String(cfg.value ?? ""), contact) };
      await db.from("contacts").update({ custom }).eq("id", contact.id);
      break;
    }
    case "split": {
      // Split test: pct percent of contacts skip the next n steps, so two versions of a message can run side by side.
      if (Math.random() * 100 < Number(cfg.pct ?? 50)) jump = 1 + Number(cfg.n ?? 1);
      break;
    }
    case "webhook": {
      const url = String(cfg.url ?? "");
      let host = "";
      try { const u = new URL(url); if (u.protocol !== "https:") throw new Error("https only"); host = u.hostname; } catch { throw new Error(`Webhook step: invalid URL ${url}`); }
      if (SSRF.test(host)) throw new Error("Webhook step: private addresses are blocked");
      const payload = JSON.stringify({ event: "automation_step", automation_id: run.automation_id, contact: { id: contact.id, first_name: contact.first_name, last_name: contact.last_name, email: contact.email, phone: contact.phone, company: contact.company, tags: contact.tags, custom: contact.custom }, booking: booking ?? null });
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-Kydos-Signature": createHmac("sha256", process.env.CRON_SECRET!).update(payload).digest("hex") }, body: payload, signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error(`Webhook ${host} returned ${r.status}`);
      break;
    }
    case "stop_if_replied": {
      const { count } = await db
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("contact_id", contact.id)
        .eq("direction", "in")
        .gte("created_at", run.started_at);
      if ((count ?? 0) > 0) stop = true;
      break;
    }
  }

  if (stop) {
    await releaseClaim(run, { status: "stopped" });
    return;
  }
  await releaseClaim(run, {
    step_position: run.step_position + jump,
    next_run_at: nextAt.toISOString(),
    ...(clearWaitStart ? { wait_started_at: null } : {}),
  });
}
