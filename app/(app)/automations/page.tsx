import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { createAutomation, toggleAutomation } from "../../actions";

const example = `send_email: Thanks for getting in touch | Hi {{first_name}},\\n\\nThanks for your enquiry. We will be in touch shortly.
wait: 48
stop_if_replied
send_sms: Hi {{first_name}}, just checking you saw our email. Reply here if you have any questions.
create_task: Call {{first_name}}`.replace(/\\n/g, "\n");

export default async function Automations() {
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const [{ data: autos }, { data: steps }, { data: runs }] = await Promise.all([
    db.from("automations").select("*").eq("workspace_id", ws.id).order("created_at"),
    db.from("automation_steps").select("*").eq("workspace_id", ws.id).order("position"),
    db.from("automation_runs").select("automation_id,status").eq("workspace_id", ws.id),
  ]);

  return (
    <div className="max-w-3xl">
      <h1 className="mb-4 text-2xl font-semibold">Automations</h1>
      {(autos ?? []).map((a) => {
        const r = (runs ?? []).filter((x) => x.automation_id === a.id);
        return (
          <div key={a.id} className="mb-4 rounded border p-3">
            <div className="flex items-center justify-between">
              <div><span className="font-semibold">{a.name}</span> <span className="text-xs text-gray-500">trigger: {a.trigger_type} {JSON.stringify(a.trigger_config)}</span></div>
              <form action={toggleAutomation}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="active" value={String(!a.active)} /><button className="rounded border px-2 text-sm">{a.active ? "Pause" : "Resume"}</button></form>
            </div>
            <ol className="ml-5 mt-2 list-decimal text-sm text-gray-700">
              {(steps ?? []).filter((s) => s.automation_id === a.id).map((s) => <li key={s.id}>{s.type} {Object.values(s.config as object).join(" | ")}</li>)}
            </ol>
            <p className="mt-2 text-xs text-gray-500">{r.filter((x) => x.status === "active").length} running, {r.filter((x) => x.status === "done").length} done, {r.filter((x) => x.status === "stopped").length} stopped</p>
          </div>
        );
      })}

      <h2 className="mb-2 mt-8 font-semibold">New automation</h2>
      <form action={createAutomation} className="flex flex-col gap-2">
        <input name="name" placeholder="Name, e.g. New lead follow-up" required className="rounded border p-2" />
        <div className="flex gap-2">
          <select name="trigger_type" className="rounded border p-2">
            <option value="contact_created">New contact</option>
            <option value="tag_added">Tag added</option>
            <option value="form_submitted">Form submitted</option>
            <option value="stage_changed">Stage changed (any)</option>
            <option value="booking_created">Booking made (Cal.com)</option>
            <option value="booking_cancelled">Booking cancelled</option>
          </select>
          <input name="trigger_value" placeholder="Tag name or form slug (optional)" className="flex-1 rounded border p-2" />
        </div>
        <textarea name="steps" rows={8} defaultValue={example} className="rounded border p-2 font-mono text-sm" />
        <p className="text-xs text-gray-500">One step per line. Branching: skip_if: cond | n and skip_unless: cond | n skip the next n steps; wait_until: cond | hours waits for a goal (or times out); end stops the run. Conditions: replied, opened, clicked, failed, tag:x, stage:Name, field:key=value, booked, booking_active, no_show, attended (prefix ! to negate). Bookings: wait_before: hours | skip_n (skips n steps if already too late), wait_after: hours. webhook: https://url (signed POST). Merge tags (double curly braces around the name): first_name, review_link, booking_link, booking_date, booking_time, feedback_link, business and any custom field key. Steps: send_email: Subject | Body, send_sms: Body, wait: hours, stop_if_replied, add_tag: x, remove_tag: x, create_task: title, move_stage: Stage name, notify: Subject | Body (emails you), create_opportunity: Title | value | Stage, wait_weekday: 9 (next weekday at 9am), enrol: Other automation name, send_whatsapp: template_name | first_name tag | other variables (approved Meta template). Use {"{{first_name}}"}.</p>
        <button className="self-start rounded bg-black px-4 py-2 text-white">Create automation</button>
      </form>
    </div>
  );
}
