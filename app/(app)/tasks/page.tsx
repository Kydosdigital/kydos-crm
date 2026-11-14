import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { assignTask, toggleTaskBoard } from "../../actions";
import { CalendarDays, Circle, User } from "lucide-react";
import { Alert, Page, PageHeader } from "@/components/ui";

/** London midnight, including the BST clock changes. */
function londonMidnight(addDays = 0, now = new Date()): string {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => Number(p.find((x) => x.type === type)?.value ?? 0);
  const localDay = new Date(Date.UTC(part("year"), part("month") - 1, part("day") + addDays));
  const asUtc = new Date(localDay.toISOString().slice(0, 10) + "T00:00:00Z");
  const local = new Date(asUtc.toLocaleString("en-US", { timeZone: "Europe/London" }));
  const utc = new Date(asUtc.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(asUtc.getTime() - (local.getTime() - utc.getTime())).toISOString();
}
const clock = () => Date.now();
const fmt = (d: string) => new Date(d).toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short" });

export default async function Tasks({
  searchParams,
}: {
  searchParams: Promise<{ assignee?: string; due?: string }>;
}) {
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const params = await searchParams;
  const [{ data: members }, { data: viewer }] = await Promise.all([
    supabaseAdmin().from("workspace_members").select("user_id,role").eq("workspace_id", ws.id),
    db.auth.getUser(),
  ]);
  const staff = (members ?? []).filter((m) => m.role !== "client");
  const requestedAssignee = params.assignee ?? "all";
  const assignee = requestedAssignee === "all" || requestedAssignee === "unassigned" || requestedAssignee === "me"
    || staff.some((m) => m.user_id === requestedAssignee) ? requestedAssignee : "all";
  const due = ["all", "overdue", "today", "upcoming", "undated"].includes(params.due ?? "all") ? (params.due ?? "all") : "all";
  const nowIso = new Date().toISOString();
  const tomorrow = londonMidnight(1);
  const startToday = londonMidnight();
  const week = londonMidnight(8);
  let taskQuery = db.from("tasks")
    .select("*, contacts(id,first_name,last_name,email)", { count: "exact" })
    .eq("workspace_id", ws.id).eq("done", false);
  if (assignee === "me") taskQuery = taskQuery.eq("assigned_to", viewer.user?.id ?? "00000000-0000-0000-0000-000000000000");
  else if (assignee === "unassigned") taskQuery = taskQuery.is("assigned_to", null);
  else if (assignee !== "all") taskQuery = taskQuery.eq("assigned_to", assignee);
  if (due === "overdue") taskQuery = taskQuery.lt("due_at", nowIso);
  else if (due === "today") taskQuery = taskQuery.gte("due_at", startToday).lt("due_at", tomorrow);
  else if (due === "upcoming") taskQuery = taskQuery.gte("due_at", nowIso).lt("due_at", week);
  else if (due === "undated") taskQuery = taskQuery.is("due_at", null);
  const { data: tasks, count: taskCount, error: taskError } =
    await taskQuery.order("due_at", { ascending: true, nullsFirst: false }).limit(300);
  const users = (await supabaseAdmin().auth.admin.listUsers({ page: 1, perPage: 1000 })).data.users;
  const who = (id: string | null) => users.find((u) => u.id === id)?.email?.split("@")[0] ?? "Unassigned";
  const now = clock(), endToday = Date.parse(tomorrow) - 1, endWeek = Date.parse(week);
  const cols: [string, typeof tasks][] = [
    ["Overdue", (tasks ?? []).filter((t) => t.due_at && +new Date(t.due_at) < now)],
    ["Today", (tasks ?? []).filter((t) => t.due_at && +new Date(t.due_at) >= now && +new Date(t.due_at) <= endToday)],
    ["This week", (tasks ?? []).filter((t) => t.due_at && +new Date(t.due_at) > endToday && +new Date(t.due_at) <= endWeek)],
    ["Later or no date", (tasks ?? []).filter((t) => !t.due_at || +new Date(t.due_at) > endWeek)],
  ];
  const TONE: Record<string, string> = { Overdue: "bg-danger", Today: "bg-brand-text", "This week": "bg-info-ink", "Later or no date": "bg-faint" };
  return (
    <Page width="full">
      <PageHeader title="Tasks" description={`Open tasks for ${ws.name}, grouped by due date. Choose an assignee or date window to narrow the board.`} />
      <form method="get" action="/tasks" className="card mb-5 flex flex-wrap items-end gap-3 p-4">
        <label className="flex min-w-52 flex-1 flex-col gap-1.5 text-[13px] font-medium text-ink">
          Assigned to
          <select name="assignee" defaultValue={assignee} className="select">
            <option value="all">All staff and unassigned</option>
            <option value="me">My tasks</option>
            <option value="unassigned">Unassigned</option>
            {staff.map((m) => <option key={m.user_id} value={m.user_id}>{who(m.user_id)}</option>)}
          </select>
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1.5 text-[13px] font-medium text-ink">
          Due period
          <select name="due" defaultValue={due} className="select">
            <option value="all">All open tasks</option>
            <option value="overdue">Overdue</option>
            <option value="today">Today (London)</option>
            <option value="upcoming">Upcoming 7 days</option>
            <option value="undated">No due date</option>
          </select>
        </label>
        <button className="btn btn-primary">Apply filters</button>
        <Link href="/tasks" className="btn btn-secondary">Clear</Link>
      </form>
      {taskError && <Alert tone="danger">Tasks could not be loaded. Please try again.</Alert>}
      {(taskCount ?? 0) > 300 && <Alert tone="warning">Showing 300 of {taskCount} matching open tasks. Refine the filters to see the remainder.</Alert>}
      <div className="grid grid-cols-4 items-start gap-4">
        {cols.map(([title, list]) => (
          <div key={title} className="rounded-[14px] border border-line bg-subtle/60 p-2">
            <h2 className="flex items-center gap-2 px-2 pb-2.5 pt-1.5 text-[13px] font-semibold text-ink"><span aria-hidden className={`h-2 w-2 rounded-full ${TONE[title]}`} />{title} <span className="rounded-full bg-surface px-1.5 text-[11px] font-medium text-muted shadow-xs">{list?.length ?? 0}</span></h2>
            <div className="flex flex-col gap-2">
              {(list ?? []).map((t) => {
                const c = t.contacts as { id: string; first_name: string | null; last_name: string | null; email: string | null } | null;
                return (
                  <div key={t.id} className="card p-3 text-[13px]">
                    <form action={toggleTaskBoard}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="done" value="true" /><button className="group flex w-full items-start gap-2 text-left font-medium text-ink" title="Mark as done"><Circle className="mt-0.5 h-4 w-4 shrink-0 text-faint transition-colors group-hover:text-brand-text" aria-hidden />{t.title}</button></form>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-xs text-muted">
                      <span className={`inline-flex items-center gap-1 ${title === "Overdue" ? "font-semibold text-danger-ink" : ""}`}><CalendarDays className="h-3.5 w-3.5" aria-hidden />{t.due_at ? fmt(t.due_at) : "No date"}</span>
                      {c && <Link href={`/contacts/${c.id}`} className="link inline-flex items-center gap-1"><User className="h-3.5 w-3.5" aria-hidden />{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email}</Link>}
                    </div>
                    <form action={assignTask} className="mt-2.5 flex gap-1.5 border-t border-line pt-2.5"><input type="hidden" name="id" value={t.id} />
                      <select name="user_id" defaultValue={t.assigned_to ?? ""} aria-label="Assign to" className="select input-sm flex-1"><option value="">Unassigned</option>{staff.map((m) => <option key={m.user_id} value={m.user_id}>{who(m.user_id)}</option>)}</select>
                      <button className="btn btn-secondary btn-sm">Assign</button></form>
                  </div>
                );
              })}
              {(list ?? []).length === 0 && <div className="rounded-[10px] border border-dashed border-line-strong px-3 py-6 text-center text-xs text-muted">Nothing here</div>}
            </div>
          </div>
        ))}
      </div>
    </Page>
  );
}
