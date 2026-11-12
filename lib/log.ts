import { supabaseAdmin } from "./supabase/admin";

/** Append-only activity log. Never throws. */
export async function logActivity(workspaceId: string, actor: string, action: string, entity?: string, entityId?: string, detail?: string) {
  try {
    await supabaseAdmin().from("activity_log").insert({ workspace_id: workspaceId, actor, action, entity, entity_id: entityId, detail });
  } catch { /* ignore */ }
}
