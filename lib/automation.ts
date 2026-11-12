import { supabaseAdmin } from "./supabase/admin";
import { render, sendEmail, sendSms } from "./messaging";

export type TriggerEvent =
  | { type: "contact_created" }
  | { type: "tag_added"; tag: string }
  | { type: "stage_changed"; stage_id: string }
  | { type: "form_submitted"; form: string };

/** Call whenever something happens. Enrols the contact in every matching active automation. */
export async function fireTrigger(workspaceId: string, contactId: string, ev: TriggerEvent) {
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
    if (existing) continue;
    await db.from("automation_runs").insert({ workspace_id: workspaceId, automation_id: a.id, contact_id: contactId });
  }
}

/** Processes every due run. Called by the cron route (every minute on Vercel Pro, or every 5 min via any scheduler). */
export async function processDueRuns(limit = 50) {
  const db = supabaseAdmin();
  const { data: runs } = await db
    .from("automation_runs")
    .select("*")
    .eq("status", "active")
    .lte("next_run_at", new Date().toISOString())
    .order("next_run_at")
    .limit(limit);

  let processed = 0;
  for (const run of runs ?? []) {
    try {
      await advance(run);
    } catch (e) {
      await db.from("automation_runs").update({ status: "failed", last_error: String(e) }).eq("id", run.id);
    }
    processed++;
  }
  return processed;
}

async function advance(run: { id: string; workspace_id: string; automation_id: string; contact_id: string; step_position: number; started_at: string }) {
  const db = supabaseAdmin();
  const [{ data: step }, { data: contact }, { data: ws }] = await Promise.all([
    db.from("automation_steps").select("*").eq("automation_id", run.automation_id).eq("position", run.step_position).maybeSingle(),
    db.from("contacts").select("*").eq("id", run.contact_id).single(),
    db.from("workspaces").select("*").eq("id", run.workspace_id).single(),
  ]);

  if (!step || !contact || !ws) {
    await db.from("automation_runs").update({ status: "done" }).eq("id", run.id);
    return;
  }

  const cfg = (step.config ?? {}) as Record<string, string | number>;
  let nextAt = new Date();
  let stop = false;

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
      const { data: stage } = await db.from("stages").select("id,pipeline_id").eq("id", String(cfg.stage_id)).single();
      if (stage) await db.from("opportunities").update({ stage_id: stage.id }).eq("contact_id", contact.id).eq("pipeline_id", stage.pipeline_id).eq("status", "open");
      break;
    }
    case "create_task":
      await db.from("tasks").insert({ workspace_id: ws.id, contact_id: contact.id, title: render(String(cfg.title ?? "Follow up"), contact) });
      break;
    case "wait":
      nextAt = new Date(Date.now() + Number(cfg.hours ?? 24) * 3600_000);
      break;
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
    await db.from("automation_runs").update({ status: "stopped" }).eq("id", run.id);
    return;
  }
  await db
    .from("automation_runs")
    .update({ step_position: run.step_position + 1, next_run_at: nextAt.toISOString() })
    .eq("id", run.id);
}
