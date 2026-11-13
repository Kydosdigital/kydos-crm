import { supabaseAdmin } from "./supabase/admin";

/**
 * Workspace data catalogue. Auth credentials are intentionally excluded:
 * mail_connections stores encrypted OAuth refresh tokens, which must be
 * re-authorised when restoring an environment.
 */
const TABLES = [
  "activity_log", "agent_drafts", "automation_runs", "automation_steps",
  "automations", "bookings", "calendar_shares", "call_logs", "contacts",
  "content_posts", "custom_fields", "email_templates", "hosted_forms",
  "invoices", "knowledge_items", "message_events", "messages", "notes",
  "opportunities", "pipelines", "proposals", "retainers", "scheduled_sends",
  "smart_lists", "snippets", "stages", "tasks", "tracking_numbers",
  "workspace_members",
] as const;

const PAGE_SIZE = 1000;

async function readTable(wsId: string, table: (typeof TABLES)[number]) {
  const db = supabaseAdmin();
  // Order by a unique key to keep pages stable and prevent duplicates or skips.
  const orderKey = table === "calendar_shares" ? "token" : table === "workspace_members" ? "user_id" : "id";
  const rows: Record<string, unknown>[] = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    const { data, error } = await db.from(table).select("*")
      .eq("workspace_id", wsId).order(orderKey)
      .range(start, start + PAGE_SIZE - 1);
    if (error) throw new Error(`Backup export failed reading ${table}: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

/**
 * Export an entire workspace, including settings and operational tables.
 * A failed table read rejects the export rather than silently writing an
 * incomplete archive. Storage objects and external provider credentials
 * are not included and must be restored or reconnected separately.
 */
export async function exportWorkspace(wsId: string) {
  const db = supabaseAdmin();
  const { data: workspace, error } = await db.from("workspaces")
    .select("*").eq("id", wsId).single();
  if (error || !workspace) throw new Error("Backup export failed to read workspace settings");

  const out: Record<string, unknown> = {
    format_version: 2,
    exported_at: new Date().toISOString(),
    workspace,
    excluded_tables: ["mail_connections"],
  };
  for (const table of TABLES) out[table] = await readTable(wsId, table);
  return out;
}

/**
 * Nightly backup: once each London calendar day between 02:00 and 05:59.
 * Errors are reported in the cron JSON response and activity log, with an
 * attempted owner alert. They must not prevent the shared cron route from
 * processing inbox sync, weekly reports or daily digests afterwards.
 */
export async function nightlyBackupIfDue() {
  const db = supabaseAdmin();
  const hour = Number(new Date().toLocaleString("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false }));
  if (hour < 2 || hour > 5) return { completed: 0, failed: 0, skipped: true, failedWorkspaces: [] as string[] };
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const { data: wss, error: workspacesError } = await db.from("workspaces").select("id,slug");
  if (workspacesError) {
    console.error("Nightly backup cannot list workspaces:", workspacesError.message);
    return { completed: 0, failed: 1, skipped: false, failedWorkspaces: ["workspace discovery"] };
  }

  let completed = 0;
  const failedWorkspaces: string[] = [];
  for (const ws of wss ?? []) {
    const filename = day + ".json";
    const path = ws.slug + "/" + filename;
    try {
      const { data: existing, error: lookupError } = await db.storage.from("backups")
        .list(ws.slug, { search: filename, limit: 10 });
      if (lookupError) throw new Error("Snapshot lookup: " + lookupError.message);
      if ((existing ?? []).some((file) => file.name === filename)) continue;

      // exportWorkspace rejects if any table query fails, rather than writing a partial archive.
      const body = JSON.stringify(await exportWorkspace(ws.id));
      const uploaded = await db.storage.from("backups").upload(
        path,
        new Blob([body], { type: "application/json" }),
        { upsert: true },
      );
      if (uploaded.error) throw new Error("Snapshot upload: " + uploaded.error.message);

      const { data: files, error: retentionError } = await db.storage.from("backups")
        .list(ws.slug, { limit: 100, sortBy: { column: "name", order: "desc" } });
      if (retentionError) throw new Error("Retention lookup: " + retentionError.message);
      const oldFiles = (files ?? []).slice(14).map((file) => ws.slug + "/" + file.name);
      if (oldFiles.length) {
        const { error: deleteError } = await db.storage.from("backups").remove(oldFiles);
        if (deleteError) throw new Error("Retention cleanup: " + deleteError.message);
      }
      completed++;
    } catch (failure) {
      failedWorkspaces.push(ws.slug);
      const detail = (failure instanceof Error ? failure.message : "Unknown backup failure").slice(0, 300);
      console.error("Nightly backup failed for workspace " + ws.slug + ": " + detail);
      const { error: activityError } = await db.from("activity_log").insert({
        workspace_id: ws.id,
        actor: "system",
        action: "backup failed",
        entity: "workspace",
        entity_id: ws.id,
        detail: detail,
      });
      if (activityError) console.error("Failed to record backup alert:", activityError.message);
      try {
        const { notifyOwner } = await import("./notify");
        const accepted = await notifyOwner(ws.id, "Nightly CRM backup failed", detail + ". Review Supabase Storage and Vercel cron logs.");
        if (!accepted) console.error("Backup owner notification could not be initiated for " + ws.slug);
      } catch (notifyFailure) {
        console.error("Backup owner notification failed:", notifyFailure);
      }
    }
  }
  return { completed, failed: failedWorkspaces.length, skipped: false, failedWorkspaces };
}
