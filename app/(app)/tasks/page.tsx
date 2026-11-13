import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { assignTask, toggleTaskBoard } from "../../actions";
import { createBoardTask } from "./actions";
import { CalendarDays, Circle, Plus, User } from "lucide-react";
import { Alert, Field, Page, PageHeader } from "@/components/ui";
import { Modal } from "@/components/ui/modal";

const clock = () => Date.now();
const fmt = (d: string) => new Date(d).toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short" });

export default async function Tasks({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const [{ data: tasks }, { data: members }] = await Promise.all([
    db.from("tasks").select("*, contacts(id,first_name,last_name,email)").eq("workspace_id", ws.id).eq("done", false).order("due_at", { ascending: true, nullsFirst: false }).limit(300),
    supabaseAdmin().from("workspace_members").select("user_id").eq("workspace_id", ws.id),
  ]);
  const users = (await supabaseAdmin().auth.admin.listUsers({ page: 1, perPage: 1000 })).data.users;
  const who = (id: string | null) => users.find((u) => u.id === id)?.email?.split("@")[0] ?? "Unassigned";
  const now = clock(), endToday = new Date(clock()).setHours(23, 59, 59, 999), endWeek = now + 7 * 864e5;
  const cols: [string, typeof tasks][] = [
    ["Overdue", (tasks ?? []).filter((t) => t.due_at && +new Date(t.due_at) < now)],
    ["Today", (tasks ?? []).filter((t) => t.due_at && +new Date(t.due_at) >= now && +new Date(t.due_at) <= endToday)],
    ["This week", (tasks ?? []).filter((t) => t.due_at && +new Date(t.due_at) > endToday && +new Date(t.due_at) <= endWeek)],
    ["Later or no date", (tasks ?? []).filter((t) => !t.due_at || +new Date(t.due_at) > endWeek)],
  ];
  const TONE: Record<string, string> = { Overdue: "bg-danger", Today: "bg-brand-text", "This week": "bg-info-ink", "Later or no date": "bg-faint" };
  return (
    <Page width="full">
      <PageHeader title="Tasks" description="Tasks from contacts and standalone work, grouped by due date."
        actions={<Modal trigger={<><Plus aria-hidden />Add task</>} title="New task">
          <form action={createBoardTask} className="grid gap-3">
            <Field label="Task title"><input name="title" required maxLength={240} placeholder="What needs doing?" className="input" /></Field>
            <Field label="Due date and time (London)"><input name="due_at" type="datetime-local" className="input" /></Field>
            <Field label="Assign to"><select name="assigned_to" className="select">
              <option value="">Unassigned</option>
              {(members ?? []).map((m) => <option key={m.user_id} value={m.user_id}>{who(m.user_id)}</option>)}
            </select></Field>
            <button className="btn btn-primary justify-self-start">Create task</button>
          </form>
        </Modal>}
      />
      {error && <Alert tone="danger">{error}</Alert>}
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
                      <select name="user_id" defaultValue={t.assigned_to ?? ""} aria-label="Assign to" className="select input-sm flex-1"><option value="">Unassigned</option>{(members ?? []).map((m) => <option key={m.user_id} value={m.user_id}>{who(m.user_id)}</option>)}</select>
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
