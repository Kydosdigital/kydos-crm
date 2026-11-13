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
 * Nightly backup: once a day after 02:00 London, stores a JSON export in Supabase Storage bucket "backups"
 * (private) and keeps the last 14. Skips quietly if the bucket cannot be written.
 */
export async function nightlyBackupIfDue() {
  const db = supabaseAdmin();
  const hour = Number(new Date().toLocaleString("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false }));
  if (hour < 2 || hour > 5) return 0;
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const { data: wss } = await db.from("workspaces").select("id,slug");
  let n = 0;
  for (const w of wss ?? []) {
    const path = `${w.slug}/${day}.json`;
    const { data: existing } = await db.storage.from("backups").list(w.slug, { search: `${day}.json`, limit: 1 });
    if (existing?.length) continue;
    const body = JSON.stringify(await exportWorkspace(w.id));
    const up = await db.storage.from("backups").upload(path, new Blob([body], { type: "application/json" }), { upsert: true });
    if (up.error) continue;
    n++;
    const { data: all } = await db.storage.from("backups").list(w.slug, { limit: 100, sortBy: { column: "name", order: "desc" } });
    const old = (all ?? []).slice(14).map((f) => `${w.slug}/${f.name}`);
    if (old.length) await db.storage.from("backups").remove(old);
  }
  return n;
}
