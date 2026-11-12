import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { createShare, deletePost, deleteShare, savePost, setPostStatus } from "../../actions";
import { CalendarDays, ExternalLink, Link2, MessageSquareQuote, Plus } from "lucide-react";
import { Alert, Badge, Card, CardTitle, EmptyState, Field, Page, PageHeader, Section, humanise, statusTone } from "@/components/ui";
import { CopyButton } from "@/components/ui/copy-button";

const STATUS: Record<string, string> = { draft: "Draft", awaiting_approval: "Awaiting client", approved: "Approved", changes_requested: "Changes requested", published: "Published" };

export default async function Calendar({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const [{ data: posts }, { data: shares }] = await Promise.all([
    db.from("content_posts").select("*").eq("workspace_id", ws.id).order("scheduled_at").limit(300),
    db.from("calendar_shares").select("*").eq("workspace_id", ws.id).order("created_at"),
  ]);
  const app = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const day = (d: string) => new Date(d).toLocaleDateString("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short" });
  const time = (d: string) => new Date(d).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });
  const byDay = new Map<string, typeof posts>();
  for (const p of posts ?? []) { const k = day(p.scheduled_at); byDay.set(k, [...(byDay.get(k) ?? []), p]); }
  return (
    <Page>
      <PageHeader title="Content calendar" description="Plan posts for each client, send them a private read-only link, and they can approve or ask for changes without logging in. Publishing to Facebook and Instagram can be added later." />
      {error && <Alert tone="danger">{error}</Alert>}

      <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-6">
        <Section title="Posts">
          {byDay.size === 0 && <div className="card"><EmptyState icon={CalendarDays} title="No posts planned yet">Add the first post with the form on the right. Tick Ready for client approval to show it on the client link.</EmptyState></div>}
          <div className="flex flex-col gap-5">
            {[...byDay.entries()].map(([d, list]) => (
              <div key={d} className="grid grid-cols-[84px_minmax(0,1fr)] gap-3">
                <div className="pt-3 text-xs font-semibold uppercase tracking-wide text-muted">{d}</div>
                <div className="flex flex-col gap-2">
                  {(list ?? []).map((p) => (
                    <div key={p.id} className="card p-4 text-[13px]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex flex-wrap items-center gap-2"><b className="font-semibold text-ink">{p.client}</b><Badge tone="outline">{humanise(p.platform)}</Badge><span className="tabular text-xs text-muted">{time(p.scheduled_at)}</span><Badge tone={statusTone(p.status)} dot>{STATUS[p.status]}</Badge></span>
                        <span className="flex items-center gap-1">
                          <form action={setPostStatus} className="flex gap-1"><input type="hidden" name="id" value={p.id} />
                            <select name="status" defaultValue={p.status} aria-label="Status" className="select input-sm !w-auto">{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><button className="btn btn-secondary btn-sm">Set</button></form>
                          <form action={deletePost}><input type="hidden" name="id" value={p.id} /><button className="btn btn-danger btn-sm">Delete</button></form></span></div>
                      <p className="mt-2.5 whitespace-pre-wrap leading-relaxed text-ink-2">{p.caption}</p>
                      {p.client_comment && <p className="alert alert-warning mt-3 !py-2 !text-xs"><MessageSquareQuote aria-hidden /><span>Client: {p.client_comment}</span></p>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <div className="flex flex-col gap-4">
          <Card>
            <CardTitle icon={Plus}>Add post</CardTitle>
            <form action={savePost} className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Client"><input name="client" required placeholder="Client" className="input" /></Field>
                <Field label="Platform"><select name="platform" className="select"><option>facebook</option><option>instagram</option><option>linkedin</option><option>tiktok</option><option>x</option><option>google business</option></select></Field>
              </div>
              <Field label="Scheduled for"><input name="scheduled_at" type="datetime-local" required className="input" /></Field>
              <Field label="Caption"><textarea name="caption" required rows={4} placeholder="Caption" className="textarea" /></Field>
              <Field label="Media link"><input name="media_url" placeholder="Image or video link (optional)" className="input" /></Field>
              <label className="check-row"><input type="checkbox" name="for_approval" className="checkbox" />Ready for client approval</label>
              <button className="btn btn-primary">Add post</button>
            </form>
          </Card>

          <Card>
            <CardTitle icon={Link2}>Client share links</CardTitle>
            <div className="flex flex-col gap-2">
              {(shares ?? []).map((s) => (
                <div key={s.token} className="well p-3 text-[13px]">
                  <div className="flex items-center justify-between gap-2"><b className="font-semibold text-ink">{s.client}</b>
                    <span className="flex items-center gap-0.5"><CopyButton text={`${app}/f/cal/${s.token}`} label="Copy link" /><form action={deleteShare}><input type="hidden" name="token" value={s.token} /><button className="btn btn-danger btn-sm">Revoke</button></form></span></div>
                  <a className="link mt-1 flex items-center gap-1 text-xs" target="_blank" href={`${app}/f/cal/${s.token}`}><span className="truncate">{`${app}/f/cal/${s.token}`}</span><ExternalLink className="h-3 w-3 shrink-0" aria-hidden /></a>
                </div>
              ))}
            </div>
            <form action={createShare} className="mt-3 flex gap-2"><input name="client" required placeholder="Client name, must match the posts" aria-label="Client name" className="input flex-1" /><button className="btn btn-secondary">Create link</button></form>
          </Card>
        </div>
      </div>
    </Page>
  );
}
