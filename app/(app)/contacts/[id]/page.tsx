import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { addNote, addTag, addTask, createOpportunity, deleteContact, mergeContact, saveCustomValues, sendMessage, setBookingOutcome, toggleTask, updateContact } from "../../../actions";

export default async function ContactPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; t?: string }> }) {
  const { id } = await params;
  const { error, t: tplId } = await searchParams;
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const [{ data: c }, { data: messages }, { data: notes }, { data: tasks }, { data: stages }, { data: templates }, { data: fields }, { data: bookings }] = await Promise.all([
    db.from("contacts").select("*").eq("id", id).eq("workspace_id", ws.id).maybeSingle(),
    db.from("messages").select("*").eq("contact_id", id).order("created_at"),
    db.from("notes").select("*").eq("contact_id", id).order("created_at", { ascending: false }),
    db.from("tasks").select("*").eq("contact_id", id).order("created_at", { ascending: false }),
    db.from("stages").select("id,name").eq("workspace_id", ws.id).order("position"),
    db.from("email_templates").select("*").eq("workspace_id", ws.id).order("name"),
    db.from("custom_fields").select("*").eq("workspace_id", ws.id).order("label"),
    db.from("bookings").select("*").eq("contact_id", id).order("start_time", { ascending: false }),
  ]);
  const tpl = (templates ?? []).find((x) => x.id === tplId);
  const { data: conn } = await (await import("@/lib/supabase/admin")).supabaseAdmin().from("mail_connections").select("account_email").eq("workspace_id", ws.id).maybeSingle();
  if (!c) notFound();

  return (
    <div className="grid max-w-6xl grid-cols-3 gap-8">
      <section className="col-span-2">
        <h1 className="text-2xl font-semibold">{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || c.phone}</h1>
        <p className="text-sm text-gray-600">{[c.email, c.phone, c.company].filter(Boolean).join("  |  ")}</p>
        <p className="mt-1 text-xs text-gray-500">
          {c.email_opt_out && "Email opted out. "}{c.sms_opt_out && "SMS opted out. "}{c.consent_note && `Consent: ${c.consent_note}`}
        </p>

        {error && <p className="mt-2 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <details className="mt-3 rounded border p-3 text-sm">
          <summary className="cursor-pointer font-medium">Edit, merge or delete</summary>
          <form action={updateContact} className="mt-3 grid grid-cols-2 gap-2">
            <input type="hidden" name="contact_id" value={c.id} />
            <input name="first_name" defaultValue={c.first_name ?? ""} placeholder="First name" className="rounded border p-1" />
            <input name="last_name" defaultValue={c.last_name ?? ""} placeholder="Last name" className="rounded border p-1" />
            <input name="email" defaultValue={c.email ?? ""} placeholder="Email" className="rounded border p-1" />
            <input name="phone" defaultValue={c.phone ?? ""} placeholder="Phone" className="rounded border p-1" />
            <input name="company" defaultValue={c.company ?? ""} placeholder="Company" className="rounded border p-1" />
            <input name="tags" defaultValue={c.tags.join(", ")} placeholder="Tags" className="rounded border p-1" />
            <input name="consent_note" defaultValue={c.consent_note ?? ""} placeholder="Consent note" className="col-span-2 rounded border p-1" />
            <label><input type="checkbox" name="email_opt_out" defaultChecked={c.email_opt_out} className="mr-1" />Email opted out</label>
            <label><input type="checkbox" name="sms_opt_out" defaultChecked={c.sms_opt_out} className="mr-1" />SMS opted out</label>
            <button className="col-span-2 rounded border px-2 py-1">Save changes</button>
          </form>
          <form action={mergeContact} className="mt-3 flex gap-2">
            <input type="hidden" name="contact_id" value={c.id} />
            <input name="other_email" placeholder="Duplicate's email, merged into this contact" className="flex-1 rounded border p-1" />
            <button className="rounded border px-2">Merge</button>
          </form>
          <form action={deleteContact} className="mt-3">
            <input type="hidden" name="contact_id" value={c.id} />
            <button className="text-red-700 underline">Delete this contact and its history</button>
          </form>
        </details>

        <h2 className="mb-2 mt-6 font-semibold">Conversation</h2>
        <div className="mb-4 flex max-h-96 flex-col gap-2 overflow-y-auto rounded border p-3">
          {(messages ?? []).length === 0 && <p className="text-sm text-gray-400">No messages yet.</p>}
          {(messages ?? []).map((m) => (
            <div key={m.id} className={`max-w-[80%] rounded p-2 text-sm ${m.direction === "out" ? "self-end bg-blue-50" : "self-start bg-gray-100"}`}>
              <div className="mb-1 text-xs text-gray-500">{m.channel}{m.subject ? `: ${m.subject}` : ""} | {m.status}{m.error ? ` (${m.error})` : ""}</div>
              {m.body}
            </div>
          ))}
        </div>
        <form action={sendMessage} className="flex flex-col gap-2">
          <input type="hidden" name="contact_id" value={c.id} />
          <div className="flex gap-2">
            <select name="channel" className="rounded border p-2">
              <option value="sms">SMS</option>
              <option value="email">Email (Resend)</option>
              {conn && <option value="outlook">Email (Outlook: {conn.account_email})</option>}
              <option value="whatsapp">WhatsApp</option>
            </select>
            <input name="subject" defaultValue={tpl?.subject} placeholder="Subject (email only)" className="flex-1 rounded border p-2" />
          </div>
          <textarea name="body" rows={3} defaultValue={tpl?.body} placeholder="Message" required className="rounded border p-2" />
          {(templates ?? []).length > 0 && <p className="text-xs text-gray-500">Templates: {(templates ?? []).map((x) => <a key={x.id} className="mr-2 underline" href={`/contacts/${c.id}?t=${x.id}`}>{x.name}</a>)}</p>}
          <button className="self-start rounded bg-black px-4 py-2 text-white">Send</button>
        </form>
      </section>

      <aside className="flex flex-col gap-6">
        {(bookings ?? []).length > 0 && (
          <div>
            <h2 className="mb-2 font-semibold">Bookings</h2>
            {(bookings ?? []).map((b) => (
              <form key={b.id} action={setBookingOutcome} className="mb-2 rounded border p-2 text-sm">
                <input type="hidden" name="booking_id" value={b.id} /><input type="hidden" name="contact_id" value={c.id} />
                <div>{new Date(b.start_time).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" })}: <b>{b.status.replace("_", " ")}</b></div>
                <div className="text-xs text-gray-500">{b.title}</div>
                {b.status !== "cancelled" && (
                  <div className="mt-1 flex gap-1">
                    <button name="status" value="attended" className="rounded border px-2 py-0.5 text-xs">Attended</button>
                    <button name="status" value="no_show" className="rounded border px-2 py-0.5 text-xs">No-show</button>
                  </div>
                )}
              </form>
            ))}
          </div>
        )}
        {(fields ?? []).length > 0 && (
          <div>
            <h2 className="mb-2 font-semibold">Custom fields</h2>
            <form action={saveCustomValues} className="flex flex-col gap-1">
              <input type="hidden" name="contact_id" value={c.id} />
              {(fields ?? []).map((f) => (
                <label key={f.id} className="text-xs text-gray-600">{f.label}
                  {f.type === "select" ? (
                    <select name={`cf_${f.key}`} defaultValue={String((c.custom ?? {})[f.key] ?? "")} className="mt-0.5 block w-full rounded border p-1 text-sm"><option value="" />{f.options.map((o: string) => <option key={o}>{o}</option>)}</select>
                  ) : (
                    <input name={`cf_${f.key}`} type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} defaultValue={String((c.custom ?? {})[f.key] ?? "")} className="mt-0.5 block w-full rounded border p-1 text-sm" />
                  )}
                </label>
              ))}
              <button className="rounded border px-2 py-1 text-sm">Save fields</button>
            </form>
          </div>
        )}
        <div>
          <h2 className="mb-2 font-semibold">Tags</h2>
          <div className="mb-2 flex flex-wrap gap-1">{c.tags.map((t: string) => <span key={t} className="rounded bg-gray-200 px-2 py-0.5 text-xs">{t}</span>)}</div>
          <form action={addTag} className="flex gap-1"><input type="hidden" name="contact_id" value={c.id} /><input name="tag" placeholder="Add tag" className="flex-1 rounded border p-1 text-sm" /><button className="rounded border px-2 text-sm">Add</button></form>
        </div>

        <div>
          <h2 className="mb-2 font-semibold">Add to pipeline</h2>
          <form action={createOpportunity} className="flex flex-col gap-1">
            <input type="hidden" name="contact_id" value={c.id} />
            <input name="title" placeholder="Opportunity title" className="rounded border p-1 text-sm" />
            <input name="value" type="number" step="0.01" placeholder="Value (£)" className="rounded border p-1 text-sm" />
            <select name="stage_id" className="rounded border p-1 text-sm">{(stages ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            <button className="rounded border px-2 py-1 text-sm">Add</button>
          </form>
        </div>

        <div>
          <h2 className="mb-2 font-semibold">Tasks</h2>
          <ul className="mb-2 text-sm">
            {(tasks ?? []).map((t) => (
              <li key={t.id}>
                <form action={toggleTask} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={t.id} /><input type="hidden" name="contact_id" value={c.id} /><input type="hidden" name="done" value={String(!t.done)} />
                  <button className="text-left">{t.done ? "☑" : "☐"} <span className={t.done ? "line-through text-gray-400" : ""}>{t.title}</span></button>
                </form>
              </li>
            ))}
          </ul>
          <form action={addTask} className="flex flex-col gap-1"><input type="hidden" name="contact_id" value={c.id} /><input name="title" placeholder="New task" required className="rounded border p-1 text-sm" /><input name="due_at" type="datetime-local" className="rounded border p-1 text-sm" /><button className="rounded border px-2 py-1 text-sm">Add task</button></form>
        </div>

        <div>
          <h2 className="mb-2 font-semibold">Notes</h2>
          <form action={addNote} className="mb-2 flex flex-col gap-1"><input type="hidden" name="contact_id" value={c.id} /><textarea name="body" rows={2} required className="rounded border p-1 text-sm" /><button className="rounded border px-2 py-1 text-sm">Save note</button></form>
          {(notes ?? []).map((n) => <p key={n.id} className="mb-1 rounded bg-yellow-50 p-2 text-sm">{n.body}</p>)}
        </div>
      </aside>
    </div>
  );
}
