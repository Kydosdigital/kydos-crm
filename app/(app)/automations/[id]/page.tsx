import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { stepsToText, triggerValue } from "@/lib/automationSteps";
import { updateAutomation, deleteAutomation } from "../../../actions";
import { Trash2 } from "lucide-react";
import { Alert, Card, Field, Page, PageHeader } from "@/components/ui";
import { StepReference } from "../step-reference";

export default async function EditAutomation({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const { data: a } = await db.from("automations").select("*").eq("id", id).eq("workspace_id", ws.id).maybeSingle();
  if (!a) notFound();
  const { data: steps } = await db.from("automation_steps").select("type,config").eq("automation_id", id).order("position");
  const T = ["contact_created:New contact", "tag_added:Tag added", "form_submitted:Form submitted", "stage_changed:Stage changed (any)", "booking_created:Booking made (Cal.com)", "booking_cancelled:Booking cancelled", "missed_call:Missed call (Twilio)", "date_reached:Date reached (custom date field)", "reply_received:Reply received (any channel)", "email_opened:Email opened", "email_clicked:Email link clicked", "invoice_paid:Invoice or retainer paid", "deal_won:Deal won", "deal_lost:Deal lost", "proposal_accepted:Proposal accepted"];
  return (
    <Page width="narrow">
      <PageHeader back={{ href: "/automations", label: "Back to automations" }} title="Edit automation" description={a.name} />
      {error && <Alert tone="danger">{error}</Alert>}
      <Card>
        <form action={updateAutomation} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={a.id} />
          <Field label="Name"><input name="name" defaultValue={a.name} required className="input" /></Field>
          <div className="grid grid-cols-[14rem_minmax(0,1fr)] gap-3">
            <Field label="Trigger"><select name="trigger_type" defaultValue={a.trigger_type} className="select">{T.map((t) => { const [v, l] = t.split(":"); return <option key={v} value={v}>{l}</option>; })}</select></Field>
            <Field label="Trigger value"><input name="trigger_value" defaultValue={triggerValue(a.trigger_type, a.trigger_config as Record<string, unknown>)} placeholder="Tag or form slug. Date trigger: field_key, days offset (add , yearly)" className="input" /></Field>
          </div>
          <Field label="Steps" hint="Contacts already part-way through keep going from their current step number, so avoid reordering steps for live runs.">
            <textarea name="steps" rows={16} defaultValue={stepsToText((steps ?? []) as { type: string; config: Record<string, unknown> }[])} spellCheck={false} className="textarea !font-mono !text-xs" />
          </Field>
          <StepReference />
          <div className="flex gap-2"><button className="btn btn-primary">Save changes</button><Link href="/automations" className="btn btn-ghost">Cancel</Link></div>
        </form>
      </Card>
      <div className="mt-6 flex items-center justify-between gap-4 rounded-xl border border-danger/25 bg-danger-bg/50 px-5 py-4">
        <p className="text-[13px] text-danger-ink">Deleting an automation cannot be undone.</p>
        <form action={deleteAutomation}><input type="hidden" name="id" value={a.id} /><button className="btn btn-danger btn-sm border-danger/30"><Trash2 aria-hidden />Delete this automation</button></form>
      </div>
    </Page>
  );
}
