import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { moveOpportunity } from "../../actions";

export default async function Pipeline() {
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const [{ data: stages }, { data: opps }] = await Promise.all([
    db.from("stages").select("*").eq("workspace_id", ws.id).order("position"),
    db.from("opportunities").select("*, contacts(first_name,last_name,email)").eq("workspace_id", ws.id),
  ]);
  const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Pipeline</h1>
      <div className="flex gap-3 overflow-x-auto">
        {(stages ?? []).map((st) => {
          const items = (opps ?? []).filter((o) => o.stage_id === st.id);
          const total = items.reduce((n, o) => n + Number(o.value), 0);
          return (
            <div key={st.id} className="w-64 shrink-0 rounded bg-gray-50 p-2">
              <div className="mb-2 flex justify-between text-sm font-semibold"><span>{st.name}</span><span className="text-gray-500">{gbp.format(total)}</span></div>
              {items.map((o) => {
                const c = o.contacts as { first_name: string | null; last_name: string | null; email: string | null } | null;
                return (
                  <div key={o.id} className="mb-2 rounded border bg-white p-2 text-sm">
                    <Link href={`/contacts/${o.contact_id}`} className="font-medium underline">{o.title}</Link>
                    <div className="text-gray-500">{[c?.first_name, c?.last_name].filter(Boolean).join(" ") || c?.email} | {gbp.format(Number(o.value))}</div>
                    <form action={moveOpportunity} className="mt-1 flex gap-1">
                      <input type="hidden" name="id" value={o.id} />
                      <select name="stage_id" defaultValue={st.id} className="flex-1 rounded border p-0.5 text-xs">{(stages ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                      <button className="rounded border px-1 text-xs">Move</button>
                    </form>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
