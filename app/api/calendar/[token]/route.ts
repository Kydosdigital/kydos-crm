import { supabaseAdmin } from "@/lib/supabase/admin";
import { notifyOwner } from "@/lib/notify";

// Client approves or requests changes from their share link (no login). Scoped to that token's workspace and client.
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const fd = await req.formData();
  const db = supabaseAdmin();
  const { data: sh } = await db.from("calendar_shares").select("*").eq("token", token).maybeSingle();
  if (!sh) return new Response("Not found", { status: 404 });
  const comment = String(fd.get("comment") ?? "").trim().slice(0, 1000) || null;
  const approve = fd.get("action") === "approve";
  const { data: post } = await db.from("content_posts").update({ status: approve ? "approved" : "changes_requested", client_comment: comment })
    .eq("id", String(fd.get("post_id"))).eq("workspace_id", sh.workspace_id).eq("client", sh.client).select("caption").maybeSingle();
  if (post) await notifyOwner(sh.workspace_id, `${sh.client} ${approve ? "approved" : "asked for changes on"} a post`, `${post.caption.slice(0, 200)}${comment ? `\n\nComment: ${comment}` : ""}`);
  return Response.redirect(new URL(`/f/cal/${token}`, process.env.NEXT_PUBLIC_APP_URL ?? req.url), 303);
}
