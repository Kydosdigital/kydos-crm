import { supabaseAdmin } from "./supabase/admin";

const TABLES = ["contacts", "opportunities", "pipelines", "stages", "notes", "tasks", "messages", "automations", "automation_steps", "bookings", "custom_fields", "smart_lists", "hosted_forms", "email_templates", "knowledge_items", "snippets"];

/** Builds a full JSON export for one workspace (used by the nightly backup and the manual download). */
export async function exportWorkspace(wsId: string) {
  const db = supabaseAdmin();
  const out: Record<string, unknown> = { exported_at: new Date().toISOString() };
  for (const t of TABLES) {
    const { data } = await db.from(t).select("*").eq("workspace_id", wsId).limit(50000);
    out[t] = data ?? [];
  }
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
