import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { stepsToText, triggerValue } from "@/lib/automationSteps";
import { updateAutomation, deleteAutomation } from "../../../actions";

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
    <div className="max-w-3xl">
      <Link href="/automations" className="text-sm text-gray-500 underline">Back to automations</Link>
      <h1 className="mb-4 mt-1 text-2xl font-semibold">Edit automation</h1>
      {error && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <form action={updateAutomation} className="flex flex-col gap-2">
        <input type="hidden" name="id" value={a.id} />
        <input name="name" defaultValue={a.name} required className="rounded border p-2" />
        <div className="flex gap-2">
          <select name="trigger_type" defaultValue={a.trigger_type} className="rounded border p-2">{T.map((t) => { const [v, l] = t.split(":"); return <option key={v} value={v}>{l}</option>; })}</select>
          <input name="trigger_value" defaultValue={triggerValue(a.trigger_type, a.trigger_config as Record<string, unknown>)} placeholder="Tag or form slug. Date trigger: field_key, days offset (add , yearly)" className="flex-1 rounded border p-2" />
        </div>
        <textarea name="steps" rows={16} defaultValue={stepsToText((steps ?? []) as { type: string; config: Record<string, unknown> }[])} className="rounded border p-2 font-mono text-sm" />
        <p className="text-xs text-gray-500">One step per line. Write line breaks inside a message as \n. Step list is the same as on the Automations page (send_email: Subject | Body, send_sms, send_whatsapp: template | first_name | other variables, wait: hours, add_tag, create_task, notify, skip_if, wait_until, webhook, end and more). Contacts already part-way through keep going from their current step number, so avoid reordering steps for live runs.</p>
        <div className="flex gap-2"><button className="rounded bg-black px-4 py-2 text-white">Save changes</button></div>
      </form>
      <form action={deleteAutomation} className="mt-6"><input type="hidden" name="id" value={a.id} /><button className="text-sm text-red-700 underline">Delete this automation</button></form>
    </div>
  );
}
