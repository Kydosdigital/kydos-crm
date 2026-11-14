"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/workspace";
import { supabaseAdmin } from "@/lib/supabase/admin";

// All actions in this file create and inspect non-sending queue snapshots.
// No action is allowed to invoke a provider, schedule a broadcast or dispatch.
function go(message: string, kind: "error" | "done"): never {
  redirect("/campaign-queue?" + kind + "=" + encodeURIComponent(message));
}

/** Prepare an immutable, workspace-scoped audience snapshot for human review. */
export async function prepareCampaignAudience(fd: FormData) {
  const { ws } = await requireStaff();
  const tag = String(fd.get("tag") ?? "").trim();
  if (!tag || tag.length > 100 || /[\u0000-\u001f\u007f]/.test(tag)) {
    return go("Enter a valid tag (1 to 100 characters)", "error");
  }

  const db = supabaseAdmin();
  // Privileged service-role writes are always scoped to the authenticated,
  // active staff workspace, never to a workspace ID supplied by the browser.
  const { data: created, error: createError } = await db.from("campaign_batches")
    .insert({ workspace_id: ws.id, source_tag: tag, channel: "email", status: "draft" })
    .select("id").single();
  if (createError || !created) {
    console.error("Could not create campaign audience draft", createError);
    return go("Could not create the audience preview. Please try again.", "error");
  }

  const { data: prepared, error: snapshotError } = await db
    .rpc("prepare_email_campaign_batch", { p_batch_id: created.id });
  if (snapshotError || !prepared || prepared.workspace_id !== ws.id) {
    console.error("Campaign audience snapshot failed", snapshotError);
    // Preparation is transactional. Delete only the newly created draft.
    // If this cleanup fails, log it for investigation rather than leaking
    // database details to the user or claiming that a send occurred.
    const { error: cleanupError } = await db.from("campaign_batches")
      .delete().eq("id", created.id).eq("workspace_id", ws.id).eq("status", "draft");
    if (cleanupError) console.error("Failed to remove unprepared campaign draft", cleanupError);
    return go("The audience could not be safely prepared. No messages were sent.", "error");
  }

  revalidatePath("/campaign-queue");
  return go("Audience prepared for review. No messages were sent.", "done");
}

/** Stop future use of a prepared audience; this action never touches providers. */
export async function cancelCampaignAudience(fd: FormData) {
  const { ws } = await requireStaff();
  const id = String(fd.get("batch_id") ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return go("Invalid campaign audience ID", "error");
  }
  const db = supabaseAdmin();
  const { data, error } = await db.from("campaign_batches")
    .update({ status: "cancelled" })
    .eq("id", id).eq("workspace_id", ws.id)
    .in("status", ["draft", "prepared"])
    .select("id").maybeSingle();
  if (error || !data) {
    return go("Audience not found in this workspace or already cancelled.", "error");
  }
  revalidatePath("/campaign-queue");
  return go("Audience preview cancelled. No messages were sent.", "done");
}
