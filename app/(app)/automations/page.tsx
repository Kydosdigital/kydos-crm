import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import Link from "next/link";
import { stepsToText } from "@/lib/automationSteps";
import { createAutomation, createFromPreset, toggleAutomation, duplicateAutomation } from "../../actions";
import { Bell, CheckSquare, Clock, Copy, GitBranch, KanbanSquare, Mail, MessageCircle, MessageSquareText, OctagonX, Pause, Pencil, Play, Plus, Shuffle, SlidersHorizontal, Tag, UserCheck, Webhook, Workflow, Zap, type LucideIcon } from "lucide-react";
import { Alert, Badge, EmptyState, Field, Page, PageHeader, humanise } from "@/components/ui";
import { Modal } from "@/components/ui/modal";
import { PRESETS } from "@/lib/automationPresets";
import { StepReference } from "./step-reference";
import { StepBuilder } from "@/components/ui/step-builder";

const STEP_ICON: Record<string, LucideIcon> = {
  send_email: Mail, send_sms: MessageSquareText, send_whatsapp: MessageCircle, notify: Bell, webhook: Webhook,
  wait: Clock, wait_weekday: Clock, wait_until: Clock, wait_before: Clock, wait_after: Clock,
  skip_if: GitBranch, skip_unless: GitBranch, split: Shuffle, stop_if_replied: OctagonX, end: OctagonX,
  add_tag: Tag, remove_tag: Tag, create_task: CheckSquare, move_stage: KanbanSquare, create_opportunity: KanbanSquare,
  assign_owner: UserCheck, set_field: SlidersHorizontal, enrol: Workflow,
};

const example = `send_email: Thanks for getting in touch | Hi {{first_name}},\\n\\nThanks for your enquiry. We will be in touch shortly.
wait: 48
stop_if_replied
send_sms: Hi {{first_name}}, just checking you saw our email. Reply here if you have any questions.
create_task: Call {{first_name}}`

export default async function Automations({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const [{ data: autos }, { data: steps }, { data: runs }] = await Promise.all([
    db.from("automations").select("*").eq("workspace_id", ws.id).order("created_at"),
    db.from("automation_steps").select("*").eq("workspace_id", ws.id).order("position"),
    db.from("automation_runs").select("automation_id,status").eq("workspace_id", ws.id),
  ]);

  return (
    <Page>
      <PageHeader
        title="Automations"
        description="Follow-up sequences that start from a trigger and run step by step for each contact."
        actions={
          <Modal wide trigger={<><Plus aria-hidden />New automation</>} title="New automation">
            <form action={createAutomation} className="flex flex-col gap-3">
              <Field label="Name"><input name="name" placeholder="Name, e.g. New lead follow-up" required className="input" /></Field>
              <div className="grid grid-cols-[14rem_minmax(0,1fr)] gap-3">
                <Field label="Trigger">
                  <select name="trigger_type" className="select">
                    <option value="contact_created">New contact</option>
                    <option value="tag_added">Tag added</option>
                    <option value="form_submitted">Form submitted</option>
                    <option value="stage_changed">Stage changed (any)</option>
                    <option value="booking_created">Booking made (Cal.com)</option>
                    <option value="booking_cancelled">Booking cancelled</option>
                    <option value="missed_call">Missed call (Twilio)</option>
                    <option value="date_reached">Date reached (custom date field)</option>
                    <option value="reply_received">Reply received (any channel)</option>
                    <option value="email_opened">Email opened</option>
                    <option value="email_clicked">Email link clicked</option>
                    <option value="invoice_paid">Invoice or retainer paid</option>
                    <option value="deal_won">Deal won</option>
                    <option value="deal_lost">Deal lost</option>
                    <option value="proposal_accepted">Proposal accepted</option>
                  </select>
                </Field>
                <Field label="Trigger value" hint="Date trigger: field_key, days offset, e.g. renewal_date, -7 (add ,yearly for birthdays).">
                  <input name="trigger_value" placeholder="Tag or form slug (optional). Date trigger: field_key, days offset, e.g. renewal_date, -7 (add ,yearly for birthdays)" className="input" />
                </Field>
              </div>
              <Field label="Steps"><StepBuilder defaultValue={example} /></Field>
              <StepReference />
              <button className="btn btn-primary self-start">Create automation</button>
            </form>
          </Modal>
        }
      />
      <div className="card">
        <div className="eyebrow mb-2">Start from a preset</div>
        <div className="grid gap-3 md:grid-cols-3">
          {PRESETS.map((p) => (
            <form key={p.key} action={createFromPreset} className="well flex flex-col gap-2">
              <input type="hidden" name="key" value={p.key} />
              <div className="font-medium text-ink">{p.name}</div>
              <p className="text-sm text-muted">{p.blurb}</p>
              <button className="btn self-start" data-toast="Preset added, paused">Use this preset</button>
            </form>
          ))}
        </div>
      </div>
      {saved && <Alert tone="success">Saved.</Alert>}
      {(autos ?? []).length === 0 && <div className="card"><EmptyState icon={Workflow} title="No automations yet">Create your first sequence with the New automation button, for example a follow-up for every new lead.</EmptyState></div>}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {(autos ?? []).map((a) => {
          const r = (runs ?? []).filter((x) => x.automation_id === a.id);
          const mine = (steps ?? []).filter((s) => s.automation_id === a.id);
          const cfg = JSON.stringify(a.trigger_config);
          return (
            <div key={a.id} className={`card overflow-hidden ${a.active ? "" : "opacity-80"}`}>
              <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><span className="truncate text-[15px] font-semibold text-ink">{a.name}</span>{a.active ? <Badge tone="success" dot>Active</Badge> : <Badge dot>Paused</Badge>}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted"><Zap className="h-3.5 w-3.5 text-warning-ink" aria-hidden /><span>trigger:</span><Badge tone="outline">{humanise(a.trigger_type)}</Badge>{cfg && cfg !== "{}" && cfg !== "null" && <code>{cfg}</code>}</div>
                </div>
                <div className="flex shrink-0 gap-1"><Link href={`/automations/${a.id}`} className="btn btn-secondary btn-sm"><Pencil aria-hidden />Edit</Link><form action={duplicateAutomation}><input type="hidden" name="id" value={a.id} /><button className="btn btn-ghost btn-sm"><Copy aria-hidden />Duplicate</button></form><form action={toggleAutomation}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="active" value={String(!a.active)} /><button className="btn btn-ghost btn-sm">{a.active ? <Pause aria-hidden /> : <Play aria-hidden />}{a.active ? "Pause" : "Resume"}</button></form></div>
              </div>
              <ol className="flex flex-col px-5 py-4">
                {mine.map((s, i) => {
                  const text = stepsToText([s as { type: string; config: Record<string, unknown> }]).replace(/\\n/g, " ").slice(0, 160);
                  const cut = text.indexOf(":");
                  const type = (cut > 0 ? text.slice(0, cut) : text).trim();
                  const rest = cut > 0 ? text.slice(cut + 1).trim() : "";
                  const Icon = STEP_ICON[type] ?? Workflow;
                  return (
                    <li key={s.id} className="relative flex gap-3 pb-3 last:pb-0">
                      {i < mine.length - 1 && <span aria-hidden className="absolute bottom-0 left-[13px] top-7 w-px bg-line" />}
                      <span className="flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-lg border border-line bg-sunken text-muted"><Icon className="h-3.5 w-3.5" aria-hidden /></span>
                      <div className="min-w-0 pt-[3px] text-[13px] leading-snug"><span className="font-medium text-ink">{humanise(type)}</span>{rest && <span className="ml-1.5 break-words text-muted">{rest}{type === "wait" && /^\d+(\.\d+)?$/.test(rest) ? " hours" : ""}</span>}</div>
                    </li>
                  );
                })}
                {mine.length === 0 && <li className="text-[13px] text-muted">No steps yet.</li>}
              </ol>
              <div className="flex gap-4 border-t border-line bg-sunken px-5 py-2.5 text-xs text-muted">
                <span><b className="tabular font-semibold text-ink">{r.filter((x) => x.status === "active").length}</b> running</span>
                <span><b className="tabular font-semibold text-ink">{r.filter((x) => x.status === "done").length}</b> done</span>
                <span><b className="tabular font-semibold text-ink">{r.filter((x) => x.status === "stopped").length}</b> stopped</span>
              </div>
            </div>
          );
        })}
      </div>
    </Page>
  );
}
