import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { createShare, deletePost, deleteShare, savePost, setPostStatus } from "../../actions";
import { updatePlannedPost } from "./actions";
import { CalendarDays, ExternalLink, Link2, MessageSquareQuote, Plus } from "lucide-react";
import { Alert, Badge, Card, CardTitle, EmptyState, Field, Page, PageHeader, Section, Segmented, humanise, statusTone } from "@/components/ui";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CopyButton } from "@/components/ui/copy-button";

const STATUS: Record<string, string> = { draft: "Draft", awaiting_approval: "Awaiting client", approved: "Approved", changes_requested: "Changes requested", published: "Published" };
function localDateTime(iso: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export default async function Calendar({ searchParams }: { searchParams: Promise<{ error?: string; view?: string; m?: string }> }) {
  const { error, view, m } = await searchParams;
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
  const isImg = (u: string | null) => !!u && /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(u);
  // Month grid
  const now = new Date();
  const [yy, mm] = /^\d{4}-\d{2}$/.test(m ?? "") ? m!.split("-").map(Number) : [now.getFullYear(), now.getMonth() + 1];
  const first = new Date(Date.UTC(yy, mm - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const dim = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const cells = Math.ceil((lead + dim) / 7) * 7;
  const key = (d: string) => new Date(d).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const byKey = new Map<string, NonNullable<typeof posts>>();
  for (const p of posts ?? []) { const k = key(p.scheduled_at); byKey.set(k, [...(byKey.get(k) ?? []), p]); }
  const mk = (y: number, mo: number) => { const d = new Date(Date.UTC(y, mo - 1, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
  const monthName = first.toLocaleDateString("en-GB", { timeZone: "UTC", month: "long", year: "numeric" });
  const todayKey = now.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const chip: Record<string, string> = { draft: "bg-subtle text-ink-2", awaiting_approval: "bg-warning-bg text-warning-ink", approved: "bg-success-bg text-success-ink", changes_requested: "bg-danger-bg text-danger-ink", published: "bg-brand-soft text-brand-soft-ink" };
  const monthView = view === "month";
  return (
    <Page>
      <PageHeader actions={<Segmented label="View" items={[{ href: "/calendar", label: "List", active: !monthView }, { href: "/calendar?view=month", label: "Month", active: monthView }]} />} title="Content calendar" description="Plan posts for each client, send them a private read-only link, and they can approve or ask for changes without logging in. Publishing to Facebook and Instagram can be added later." />
      {error && <Alert tone="danger">{error}</Alert>}

      <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-6">
        <Section title={monthView ? monthName : "Posts"}>
          {monthView && (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                <Link href={`/calendar?view=month&m=${mk(yy, mm - 1)}`} className="btn btn-secondary btn-sm" aria-label="Previous month"><ChevronLeft aria-hidden /></Link>
                <Link href="/calendar?view=month" className="text-[13px] font-semibold text-ink hover:underline">{monthName}</Link>
                <Link href={`/calendar?view=month&m=${mk(yy, mm + 1)}`} className="btn btn-secondary btn-sm" aria-label="Next month"><ChevronRight aria-hidden /></Link>
              </div>
              <div className="grid grid-cols-7 border-b border-line bg-sunken text-center text-[11px] font-semibold uppercase tracking-wide text-muted">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-2">{d}</div>)}</div>
              <div className="grid grid-cols-7">
                {Array.from({ length: cells }, (_, i) => {
                  const dn = i - lead + 1;
                  const inMonth = dn >= 1 && dn <= dim;
                  const k = inMonth ? `${yy}-${String(mm).padStart(2, "0")}-${String(dn).padStart(2, "0")}` : "";
                  const list = (k && byKey.get(k)) || [];
                  return (
                    <div key={i} className={`min-h-[92px] border-b border-r border-line p-1.5 ${inMonth ? "" : "bg-sunken/60"}`}>
                      {inMonth && <div className={`tabular mb-1 text-xs ${k === todayKey ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand font-semibold text-brand-ink" : "text-muted"}`}>{dn}</div>}
                      <div className="flex flex-col gap-1">
                        {list.slice(0, 3).map((p) => <div key={p.id} title={`${p.client}: ${p.caption}`} className={`truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${chip[p.status] ?? chip.draft}`}>{time(p.scheduled_at)} {p.client}</div>)}
                        {list.length > 3 && <div className="px-1 text-[11px] text-muted">+{list.length - 3} more</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {!monthView && byDay.size === 0 && <div className="card"><EmptyState icon={CalendarDays} title="No posts planned yet">Add the first post with the form on the right. Tick Ready for client approval to show it on the client link.</EmptyState></div>}
          {!monthView && <div className="flex flex-col gap-5">
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
                      <div className="mt-2.5 flex gap-3">
                        {isImg(p.media_url) && /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.media_url!} alt="" loading="lazy" className="h-20 w-20 shrink-0 rounded-lg border border-line object-cover" />}
                        <p className="min-w-0 whitespace-pre-wrap leading-relaxed text-ink-2">{p.caption}</p>
                      </div>
                      {p.client_comment && <p className="alert alert-warning mt-3 !py-2 !text-xs"><MessageSquareQuote aria-hidden /><span>Client: {p.client_comment}</span></p>}
                      {p.status !== "published" && (
                        <details className="disclosure mt-3 border-t border-line pt-3">
                          <summary className="cursor-pointer text-xs font-semibold text-brand-text">Edit planned post</summary>
                          <form action={updatePlannedPost} className="mt-3 grid gap-3">
                            <input type="hidden" name="id" value={p.id} />
                            <div className="grid grid-cols-2 gap-3">
                              <Field label="Platform"><select name="platform" defaultValue={p.platform} className="select">
                                {["facebook", "instagram", "linkedin", "tiktok", "x", "google business"].map((platform) => <option key={platform} value={platform}>{humanise(platform)}</option>)}
                              </select></Field>
                              <Field label="Scheduled for"><input type="datetime-local" name="scheduled_at" required defaultValue={localDateTime(p.scheduled_at)} className="input" /></Field>
                            </div>
                            <Field label="Caption"><textarea name="caption" required rows={4} defaultValue={p.caption} className="textarea" /></Field>
                            <Field label="Media link"><input type="url" name="media_url" defaultValue={p.media_url ?? ""} placeholder="https://..." className="input" /></Field>
                            <label className="check-row"><input type="checkbox" name="for_approval" defaultChecked={p.status === "awaiting_approval" || p.status === "changes_requested"} className="checkbox" />Request client approval after saving</label>
                            <p className="text-xs text-muted">Editing a post resets its previous approval. Leave unchecked to save as a draft.</p>
                            <button className="btn btn-secondary btn-sm justify-self-start">Save changes</button>
                          </form>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>}
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
