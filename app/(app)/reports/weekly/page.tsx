import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { Alert, Card, Page, PageHeader, Stat, TableCard } from "@/components/ui";
import { CopyButton } from "@/components/ui/copy-button";
import { CalendarCheck, CheckSquare, Mail, MessageCircle, Trophy, UserPlus } from "lucide-react";

export const dynamic = "force-dynamic";
const periodDays = 7;

export default async function WeeklyClientSummary() {
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const end = new Date();
  const start = new Date(end.getTime() - periodDays * 864e5).toISOString();
  const until = end.toISOString();
  // Grouped totals must include all published posts, not just the first 500.
  // Stable ordering prevents skipping rows when several posts share a date.
  async function loadPublishedPosts() {
    const rows: Array<{ client: string; platform: string; scheduled_at: string }> = [];
    const batch = 1000;
    for (let startRow = 0; startRow < 50000; startRow += batch) {
      const { data, error } = await db.from("content_posts")
        .select("client,platform,scheduled_at")
        .eq("workspace_id", ws.id).eq("status", "published")
        .gte("scheduled_at", start).lt("scheduled_at", until)
        .order("scheduled_at").order("id")
        .range(startRow, startRow + batch - 1);
      if (error) return { data: null, error };
      rows.push(...(data ?? []));
      if ((data?.length ?? 0) < batch) return { data: rows, error: null };
    }
    // Fail explicitly instead of reporting a sampled result as a full total.
    return { data: null, error: { message: "Published post list exceeds safe reporting limit" } };
  }
  const [leads, sent, replies, bookings, won, posts, approvals, completedTasks] = await Promise.all([
    db.from("contacts").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id).gte("created_at", start).lt("created_at", until),
    db.from("messages").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id).eq("direction", "out").neq("status", "failed").neq("status", "queued").gte("created_at", start).lt("created_at", until),
    db.from("messages").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id).eq("direction", "in").gte("created_at", start).lt("created_at", until),
    db.from("bookings").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id).neq("status", "cancelled").gte("created_at", start).lt("created_at", until),
    db.from("opportunities").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id).eq("status", "won").gte("closed_at", start).lt("closed_at", until),
    loadPublishedPosts(),
    db.from("content_posts").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id).eq("status", "awaiting_approval"),
    db.from("tasks").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id).eq("done", true),
  ]);

  const value = (row: { count: number | null; error: unknown }) => row.error ? "Unavailable" : String(row.count ?? 0);
  const hasError = [leads, sent, replies, bookings, won, posts, approvals, completedTasks].some((r) => !!r.error);
  const byClient = new Map<string, number>();
  for (const post of posts.data ?? []) byClient.set(post.client, (byClient.get(post.client) ?? 0) + 1);
  const clients = [...byClient.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const fmt = (date: string | Date) => new Date(date).toLocaleString("en-GB", {
    timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  const textReport = [
    `${ws.name}: weekly CRM and content summary`,
    `Rolling seven days, ${fmt(start)} to ${fmt(end)} (London)`,
    `New leads: ${value(leads)}`,
    `Outbound message records: ${value(sent)}`,
    `Inbound replies: ${value(replies)}`,
    `Active bookings created: ${value(bookings)}`,
    `Deals closed as won: ${value(won)}`,
    `Posts marked Published and scheduled this week: ${posts.error ? "Unavailable" : String(posts.data?.length ?? 0)}`,
    ...clients.map(([client, count]) => `  ${client}: ${count} published post${count === 1 ? "" : "s"}`),
    `Posts awaiting approval (current backlog): ${value(approvals)}`,
    `Tasks marked done (all time, completion date not stored): ${value(completedTasks)}`,
    "Notes: outgoing records do not prove delivery; Published status does not verify a social-platform URL; task completion dates are not yet recorded.",
  ].join("\n");

  return (
    <Page>
      <PageHeader title="Weekly client summary"
        description={`Rolling seven days ending ${fmt(end)}. Figures are scoped to ${ws.name}.`}
        actions={<CopyButton text={textReport} label="Copy summary" />} />
      {hasError && <Alert tone="danger">Some report queries failed. Unavailable figures must not be treated as zero.</Alert>}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        <Stat label="New leads" value={value(leads)} icon={UserPlus} />
        <Stat label="Outgoing message records" value={value(sent)} icon={Mail} />
        <Stat label="Inbound replies" value={value(replies)} icon={MessageCircle} />
        <Stat label="Bookings created" value={value(bookings)} icon={CalendarCheck} />
        <Stat label="Won deals" value={value(won)} icon={Trophy} />
        <Stat label="Awaiting approval" value={value(approvals)} icon={CheckSquare} tone={(approvals.count ?? 0) > 0 ? "warning" : "brand"} />
      </div>
      <TableCard>
        <div className="px-5 pb-1 pt-4"><h2 className="text-sm font-semibold text-ink">Published content by client</h2></div>
        <table className="table"><thead><tr><th>Client</th><th className="num">Posts</th></tr></thead><tbody>
          {clients.map(([client, count]) => <tr key={client}><td>{client}</td><td className="num">{count}</td></tr>)}
          {!clients.length && <tr><td colSpan={2} className="py-6 text-center text-muted">No posts are marked Published for this reporting period.</td></tr>}
        </tbody></table>
      </TableCard>
      <Card className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-ink">Operational notes</h2>
        <p className="text-[13px] text-ink-2">The period is a rolling seven days. Leads use creation time, bookings use booking creation time and won deals use their closure date. A post counts when it is marked Published and its scheduled date falls within the period.</p>
        <p className="mt-2 text-[13px] text-muted">Outgoing message records do not prove delivery. Post status does not verify a live social URL. Tasks marked done, currently {value(completedTasks)}, are all-time because the task table does not yet record a completion timestamp.</p>
      </Card>
    </Page>
  );
}
