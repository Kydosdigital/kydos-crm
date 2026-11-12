import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const STATUS: Record<string, string> = { draft: "Draft", awaiting_approval: "Awaiting your approval", approved: "Approved", changes_requested: "Changes requested", published: "Published" };

// Private client view of their content calendar. The long random token is the only credential.
export default async function Share({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = admin();
  const { data: sh } = await db.from("calendar_shares").select("*").eq("token", token).maybeSingle();
  if (!sh) notFound();
  const { data: ws } = await db.from("workspaces").select("name").eq("id", sh.workspace_id).single();
  const { data: posts } = await db.from("content_posts").select("*").eq("workspace_id", sh.workspace_id).eq("client", sh.client).neq("status", "draft").order("scheduled_at");
  const when = (d: string) => new Date(d).toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="mx-auto my-8 max-w-2xl px-4">
      <h1 className="text-2xl font-semibold">{sh.client}: content calendar</h1>
      <p className="mb-6 text-sm text-gray-500">Prepared by {ws?.name}. Approve each post or tell us what to change.</p>
      {(posts ?? []).length === 0 && <p className="text-gray-500">Nothing to review yet.</p>}
      {(posts ?? []).map((p) => (
        <div key={p.id} className="mb-4 rounded-lg border bg-white p-4 text-sm shadow-sm">
          <div className="mb-1 text-xs text-gray-500">{when(p.scheduled_at)} · {p.platform} · <b>{STATUS[p.status]}</b></div>
          <p className="whitespace-pre-wrap">{p.caption}</p>
          {p.media_url && <a href={p.media_url} target="_blank" className="mt-1 inline-block text-xs underline">View image or video</a>}
          {p.client_comment && <p className="mt-2 rounded bg-yellow-50 p-2 text-xs">Your comment: {p.client_comment}</p>}
          {(p.status === "awaiting_approval" || p.status === "changes_requested") && (
            <form method="post" action={`/api/calendar/${token}`} className="mt-3 flex flex-col gap-2">
              <input type="hidden" name="post_id" value={p.id} />
              <textarea name="comment" rows={2} placeholder="Comments or changes (optional)" className="rounded border p-2" />
              <div className="flex gap-2"><button name="action" value="approve" className="rounded bg-green-700 px-3 py-1.5 text-white">Approve</button><button name="action" value="changes" className="rounded border px-3 py-1.5">Request changes</button></div>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}
function admin() { return supabaseAdmin(); }
