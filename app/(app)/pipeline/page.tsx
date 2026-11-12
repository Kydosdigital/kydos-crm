import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { moveOpportunity, createOpportunity, setLostReason } from "../../actions";
import { StageSelect } from "@/components/shell/stage-select";
import { Modal } from "@/components/ui/modal";
import { KanbanSquare, Plus } from "lucide-react";
import { PipelineDnd } from "@/components/shell/pipeline-dnd";
import { Avatar, EmptyState, Page, PageHeader, personName } from "@/components/ui";

export default async function Pipeline() {
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const [{ data: stages }, { data: opps }] = await Promise.all([
    db.from("stages").select("*").eq("workspace_id", ws.id).order("position"),
    db.from("opportunities").select("*, contacts(first_name,last_name,email)").eq("workspace_id", ws.id),
  ]);
  const { data: contacts } = await db.from("contacts").select("id,first_name,last_name,email").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(300);
  const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

  const DOTS = ["bg-info-ink", "bg-violet-ink", "bg-warning-ink", "bg-brand-text", "bg-success-ink", "bg-danger-ink"];
  const grand = (opps ?? []).reduce((n, o) => n + Number(o.value), 0);

  return (
    <Page width="full">
      <PageHeader
        title="Pipeline"
        description="Every opportunity by stage. Drag a card to another stage, or use the stage menu on the card."
        actions={<div className="flex items-center gap-5 text-right">
          <Modal trigger={<><Plus aria-hidden />Add opportunity</>} title="Add opportunity" description="Pick an existing contact and the stage it starts in.">
            <form action={createOpportunity} className="flex flex-col gap-3">
              <div><label className="label" htmlFor="opp-contact">Contact</label>
                <select id="opp-contact" name="contact_id" required className="select">{(contacts ?? []).map((c) => <option key={c.id} value={c.id}>{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email}</option>)}</select></div>
              <div><label className="label" htmlFor="opp-title">Title</label><input id="opp-title" name="title" placeholder="e.g. Website redesign" className="input" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label" htmlFor="opp-value">Value (£)</label><input id="opp-value" name="value" type="number" step="0.01" min="0" defaultValue="0" className="input" /></div>
                <div><label className="label" htmlFor="opp-stage">Stage</label><select id="opp-stage" name="stage_id" className="select">{(stages ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              </div>
              <button className="btn btn-primary self-start">Add opportunity</button>
            </form>
          </Modal>
          <div><div className="eyebrow">Opportunities</div><div className="tabular text-lg font-semibold leading-tight text-ink">{(opps ?? []).length}</div></div>
          <div className="h-8 w-px bg-line" aria-hidden />
          <div><div className="eyebrow">Total value</div><div className="tabular text-lg font-semibold leading-tight text-ink">{gbp.format(grand)}</div></div>
        </div>}
      />
      {(stages ?? []).length === 0 && <div className="card"><EmptyState icon={KanbanSquare} title="No pipeline stages yet">Stages appear here once they are set up for this business.</EmptyState></div>}
      <datalist id="lost-reasons">{["Price too high", "Went with a competitor", "No budget", "No response", "Not a good fit", "Timing"].map((r) => <option key={r} value={r} />)}</datalist>
      <PipelineDnd>
        {(stages ?? []).map((st, si) => {
          const items = (opps ?? []).filter((o) => o.stage_id === st.id);
          const total = items.reduce((n, o) => n + Number(o.value), 0);
          return (
            <div key={st.id} data-stage={st.id} className="flex w-[290px] shrink-0 flex-col rounded-[14px] border border-line bg-subtle/60 p-2">
              <div className="flex items-center justify-between gap-2 px-2 pb-2.5 pt-1.5">
                <span className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-ink"><span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${DOTS[si % DOTS.length]}`} /><span className="truncate">{st.name}</span><span className="rounded-full bg-surface px-1.5 text-[11px] font-medium text-muted shadow-xs">{items.length}</span></span>
                <span className="tabular shrink-0 text-xs font-medium text-muted">{gbp.format(total)}</span>
              </div>
              <div className="flex flex-col gap-2">
                {items.map((o) => {
                  const c = o.contacts as { first_name: string | null; last_name: string | null; email: string | null } | null;
                  return (
                    <div key={o.id} data-opp={o.id} draggable className="card cursor-grab p-3 transition-shadow hover:shadow-md">
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/contacts/${o.contact_id}`} className="link-quiet text-[13px] leading-snug">{o.title}</Link>
                        <span className="tabular shrink-0 text-[13px] font-semibold text-ink">{gbp.format(Number(o.value))}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-xs text-muted"><Avatar name={personName(c)} size="sm" /><span className="truncate">{[c?.first_name, c?.last_name].filter(Boolean).join(" ") || c?.email}</span></div>
                      {o.status === "lost" && (
                        <form action={setLostReason} className="mt-2.5 flex gap-1.5">
                          <input type="hidden" name="id" value={o.id} />
                          <input name="lost_reason" list="lost-reasons" defaultValue={o.lost_reason ?? ""} placeholder="Why was it lost?" aria-label="Lost reason" className="input input-sm flex-1" />
                          <button className="btn btn-secondary btn-sm">Save</button>
                        </form>
                      )}
                      <form action={moveOpportunity} className="mt-2.5 flex gap-1.5 border-t border-line pt-2.5">
                        <input type="hidden" name="id" value={o.id} />
                        <StageSelect stages={(stages ?? []).map((x) => ({ id: x.id, name: x.name }))} value={st.id} />
                      </form>
                    </div>
                  );
                })}
                {items.length === 0 && <div className="rounded-[10px] border border-dashed border-line-strong px-3 py-6 text-center text-xs text-muted">No opportunities</div>}
              </div>
            </div>
          );
        })}
      </PipelineDnd>
    </Page>
  );
}
