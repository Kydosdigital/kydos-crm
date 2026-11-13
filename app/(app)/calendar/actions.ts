"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";

const PLATFORMS = new Set(["facebook", "instagram", "linkedin", "tiktok", "x", "google business"]);

function fail(message: string): never {
  redirect(`/calendar?error=${encodeURIComponent(message)}`);
}

/** The existing calendar form interprets the input date in Europe/London. */
function londonOffsetMs(local: string) {
  const asUtc = new Date(local + "Z");
  const london = new Date(asUtc.toLocaleString("en-US", { timeZone: "Europe/London" }));
  const utc = new Date(asUtc.toLocaleString("en-US", { timeZone: "UTC" }));
  return london.getTime() - utc.getTime();
}

export async function updatePlannedPost(fd: FormData) {
  const { ws } = await requireStaff();
  const id = String(fd.get("id") ?? "").trim();
  const caption = String(fd.get("caption") ?? "").trim();
  const platform = String(fd.get("platform") ?? "").trim().toLowerCase();
  const at = String(fd.get("scheduled_at") ?? "").trim();
  const media = String(fd.get("media_url") ?? "").trim() || null;
  if (!id || !caption || caption.length > 10000 || !PLATFORMS.has(platform)) fail("Check caption and platform");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(at)) fail("Choose a valid scheduled date and time");
  if (media && !(media.startsWith("https://") || /^\/(?!\/)/.test(media))) fail("Use a secure media link");
  const date = new Date(new Date(at + "Z").getTime() - londonOffsetMs(at));
  if (!Number.isFinite(date.getTime())) fail("Choose a valid scheduled date and time");
  const db = await supabaseServer();
  const { data: original, error: readError } = await db.from("content_posts")
    .select("caption,platform,media_url,scheduled_at,status")
    .eq("id", id).eq("workspace_id", ws.id).maybeSingle();
  if (readError || !original) fail("Post not found in this workspace");
  if (original.status === "published") fail("Published posts cannot be edited");
  const scheduled_at = date.toISOString();
  const changed = caption !== original.caption || platform !== original.platform ||
    media !== original.media_url || scheduled_at !== original.scheduled_at;
  if (!changed) return;
  // Changing approved content invalidates the previous approval.
  const status = fd.get("for_approval") === "on" ? "awaiting_approval" : "draft";
  const { data: updated, error } = await db.from("content_posts")
    .update({ caption, platform, media_url: media, scheduled_at, status })
    .eq("id", id).eq("workspace_id", ws.id).neq("status", "published")
    .select("id").maybeSingle();
  if (error || !updated) fail("Could not update this post. Try again");
  revalidatePath("/calendar");
}

/** Reuse an existing post as a new draft, leaving its approval state untouched. */
export async function duplicatePlannedPost(fd: FormData) {
  const { ws } = await requireStaff();
  const id = String(fd.get("id") ?? "").trim();
  if (!id) return fail("Choose a post to duplicate");
  const db = await supabaseServer();
  const { data: original, error: readError } = await db.from("content_posts")
    .select("client,platform,caption,media_url,scheduled_at")
    .eq("id", id).eq("workspace_id", ws.id).maybeSingle();
  if (readError || !original) return fail("Post not found in this workspace");
  // An extra week makes the copy easy to distinguish in the calendar.
  // It remains a draft and must go through the normal approval process.
  const nextDate = new Date(original.scheduled_at);
  nextDate.setUTCDate(nextDate.getUTCDate() + 7);
  const { error: insertError } = await db.from("content_posts").insert({
    workspace_id: ws.id,
    client: original.client,
    platform: original.platform,
    caption: original.caption,
    media_url: original.media_url,
    scheduled_at: nextDate.toISOString(),
    status: "draft",
    client_comment: null,
  });
  if (insertError) return fail("Could not duplicate the post");
  revalidatePath("/calendar");
  redirect("/calendar?done=" + encodeURIComponent("Draft copy created. Review its date and caption before requesting approval."));
}
