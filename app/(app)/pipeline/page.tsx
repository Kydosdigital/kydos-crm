import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { moveOpportunity } from "../../actions";
import { ArrowRight, KanbanSquare } from "lucide-react";
import { Avatar, EmptyState, Page, PageHeader, personName } from "@/components/ui";

export default async function Pipeline() {
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const [{ data: stages }, { data: opps }] = await Promise.all([
    db.from("stages").select("*").eq("workspace_id", ws.id).order("position"),
    db.from("opportunities").select("*, contacts(first_name,last_name,email)").eq("workspace_id", ws.id),
  ]);
  const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

  const DOTS = ["bg-info-ink", "bg-violet-ink", "bg-warning-ink", "bg-brand-text", "bg-success-ink", "bg-danger-ink"];
  const grand = (opps ?? []).reduce((n, o) => n + Number(o.value), 0);

  return (
    <Page width="full">
      <PageHeader
        title="Pipeline"
        description="Every opportunity by stage. Use the stage menu on a card to move it along."
        actions={<div className="flex items-center gap-5 text-right">
          <div><div className="eyebrow">Opportunities</div><div className="tabular text-lg font-semibold leading-tight text-ink">{(opps ?? []).length}</div></div>
          <div className="h-8 w-px bg-line" aria-hidden />
          <div><div className="eyebrow">Total value</div><div className="tabular text-lg font-semibold leading-tight text-ink">{gbp.format(grand)}</div></div>
        </div>}
      />
      {(stages ?? []).length === 0 && <div className="card"><EmptyState icon={KanbanSquare} title="No pipeline stages yet">Stages appear here once they are set up for this business.</EmptyState></div>}
      <div className="-mx-8 flex gap-3 overflow-x-auto px-8 pb-4">
        {(stages ?? []).map((st, si) => {
          const items = (opps ?? []).filter((o) => o.stage_id === st.id);
          const total = items.reduce((n, o) => n + Number(o.value), 0);
          return (
            <div key={st.id} className="flex w-[290px] shrink-0 flex-col rounded-[14px] border border-line bg-subtle/60 p-2">
              <div className="flex items-center justify-between gap-2 px-2 pb-2.5 pt-1.5">
                <span className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-ink"><span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${DOTS[si % DOTS.length]}`} /><span className="truncate">{st.name}</span><span className="rounded-full bg-surface px-1.5 text-[11px] font-medium text-muted shadow-xs">{items.length}</span></span>
                <span className="tabular shrink-0 text-xs font-medium text-muted">{gbp.format(total)}</span>
              </div>
              <div className="flex flex-col gap-2">
                {items.map((o) => {
                  const c = o.contacts as { first_name: string | null; last_name: string | null; email: string | null } | null;
                  return (
                    <div key={o.id} className="card p-3 transition-shadow hover:shadow-md">
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/contacts/${o.contact_id}`} className="link-quiet text-[13px] leading-snug">{o.title}</Link>
                        <span className="tabular shrink-0 text-[13px] font-semibold text-ink">{gbp.format(Number(o.value))}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-xs text-muted"><Avatar name={personName(c)} size="sm" /><span className="truncate">{[c?.first_name, c?.last_name].filter(Boolean).join(" ") || c?.email}</span></div>
                      <form action={moveOpportunity} className="mt-2.5 flex gap-1.5 border-t border-line pt-2.5">
                        <input type="hidden" name="id" value={o.id} />
                        <select name="stage_id" defaultValue={st.id} aria-label="Move to stage" className="select input-sm flex-1">{(stages ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                        <button className="btn btn-secondary btn-sm">Move<ArrowRight aria-hidden /></button>
                      </form>
                    </div>
                  );
                })}
                {items.length === 0 && <div className="rounded-[10px] border border-dashed border-line-strong px-3 py-6 text-center text-xs text-muted">No opportunities</div>}
              </div>
            </div>
          );
        })}
      </div>
    </Page>
  );
}
