import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { CalendarClock, Check, ExternalLink, MessageSquareQuote } from "lucide-react";
import { ClientShell } from "@/components/shell/public-shell";
import { Badge, EmptyState, humanise, statusTone } from "@/components/ui";

export const dynamic = "force-dynamic";
const STATUS: Record<string, string> = { draft: "Draft", awaiting_approval: "Awaiting your approval", approved: "Approved", changes_requested: "Changes requested", published: "Published" };

// Private client view of their content calendar. The long random token is the only credential.
export default async function Share({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = admin();
  const { data: sh } = await db.from("calendar_shares").select("*").eq("token", token).maybeSingle();
  if (!sh) notFound();
  const { data: ws } = await db.from("workspaces").select("name,brand_color,logo_url").eq("id", sh.workspace_id).single();
  const { data: posts } = await db.from("content_posts").select("*").eq("workspace_id", sh.workspace_id).eq("client", sh.client).neq("status", "draft").order("scheduled_at");
  const when = (d: string) => new Date(d).toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const waiting = (posts ?? []).filter((p) => p.status === "awaiting_approval" || p.status === "changes_requested").length;
  return (
    <ClientShell width="lg" brand={{ name: ws?.name, color: ws?.brand_color, logo: ws?.logo_url }} footer={<>Prepared by {ws?.name}. This is a private link, please do not share it.</>}>
      <p className="eyebrow mb-2">Content calendar</p>
      <h1 className="font-display text-[40px] leading-[1.05] tracking-tight text-ink">{sh.client}</h1>
      <p className="mb-8 mt-2 text-[14px] text-muted">Prepared by {ws?.name}. Approve each post or tell us what to change.{waiting > 0 && <> <b className="font-semibold text-ink">{waiting} waiting for you.</b></>}</p>
      {(posts ?? []).length === 0 && <div className="card"><EmptyState icon={CalendarClock} title="Nothing to review yet.">We will email you when new posts are ready for approval.</EmptyState></div>}
      <div className="flex flex-col gap-4">
        {(posts ?? []).map((p) => (
          <article key={p.id} className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-sunken px-5 py-2.5">
              <div className="flex items-center gap-2 text-[13px] text-muted"><CalendarClock className="h-4 w-4" aria-hidden /><span className="font-medium text-ink">{when(p.scheduled_at)}</span><span aria-hidden>·</span><span>{humanise(p.platform)}</span></div>
              <Badge tone={statusTone(p.status)} dot>{STATUS[p.status]}</Badge>
            </div>
            <div className="px-5 py-4">
              <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink">{p.caption}</p>
              {p.media_url && <a href={p.media_url} target="_blank" className="link mt-3 inline-flex items-center gap-1 text-[13px]">View image or video<ExternalLink className="h-3.5 w-3.5" aria-hidden /></a>}
              {p.client_comment && <p className="alert alert-warning mt-3"><MessageSquareQuote aria-hidden /><span>Your comment: {p.client_comment}</span></p>}
              {(p.status === "awaiting_approval" || p.status === "changes_requested") && (
                <form method="post" action={`/api/calendar/${token}`} className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
                  <input type="hidden" name="post_id" value={p.id} />
                  <textarea name="comment" rows={2} placeholder="Comments or changes (optional)" aria-label="Comments or changes (optional)" className="textarea" />
                  <div className="flex gap-2"><button name="action" value="approve" className="btn btn-primary"><Check />Approve</button><button name="action" value="changes" className="btn btn-secondary">Request changes</button></div>
                </form>
              )}
            </div>
          </article>
        ))}
      </div>
    </ClientShell>
  );
}
function admin() { return supabaseAdmin(); }
