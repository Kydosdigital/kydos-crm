import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { assignTask, toggleTaskBoard } from "../../actions";

const clock = () => Date.now();
const fmt = (d: string) => new Date(d).toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short" });

export default async function Tasks() {
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
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Tasks</h1>
      <div className="grid grid-cols-4 gap-4">
        {cols.map(([title, list]) => (
          <div key={title} className="rounded border bg-white p-3">
            <h2 className="mb-2 text-sm font-semibold">{title} <span className="font-normal text-gray-500">({list?.length ?? 0})</span></h2>
            {(list ?? []).map((t) => {
              const c = t.contacts as { id: string; first_name: string | null; last_name: string | null; email: string | null } | null;
              return (
                <div key={t.id} className="mb-2 rounded border p-2 text-sm">
                  <form action={toggleTaskBoard}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="done" value="true" /><button className="text-left">☐ {t.title}</button></form>
                  <div className="mt-1 text-xs text-gray-500">{t.due_at ? fmt(t.due_at) : "No date"}{c && <> · <Link href={`/contacts/${c.id}`} className="underline">{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email}</Link></>}</div>
                  <form action={assignTask} className="mt-1 flex gap-1"><input type="hidden" name="id" value={t.id} />
                    <select name="user_id" defaultValue={t.assigned_to ?? ""} className="rounded border p-0.5 text-xs"><option value="">Unassigned</option>{(members ?? []).map((m) => <option key={m.user_id} value={m.user_id}>{who(m.user_id)}</option>)}</select>
                    <button className="text-xs underline">Assign</button></form>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
