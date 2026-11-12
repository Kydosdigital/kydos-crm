import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { callContact, addNote, addTag, addTask, createOpportunity, deleteContact, mergeContact, saveCustomValues, sendMessage, setBookingOutcome, toggleTask, updateContact } from "../../../actions";
import { Building2, CalendarCheck, CheckCircle2, Circle, History, KanbanSquare, ListChecks, Mail, MessageSquare, Pencil, Phone, PhoneCall, Send, ShieldCheck, SlidersHorizontal, StickyNote, Tag } from "lucide-react";
import { Alert, Avatar, Badge, CardTitle, ChannelIcon, EmptyState, Field, Page, StatusBadge, channelLabel, dateTime, humanise, personName } from "@/components/ui";
import { Modal } from "@/components/ui/modal";
import { ScrollEnd } from "@/components/ui/scroll-end";

export default async function ContactPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; t?: string; s?: string; msg?: string }> }) {
  const { id } = await params;
  const { error, t: tplId, s: snipId, msg } = await searchParams;
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const [{ data: c }, { data: messages }, { data: notes }, { data: tasks }, { data: stages }, { data: templates }, { data: fields }, { data: bookings }, { data: snippets }, { data: calls }, { data: events }] = await Promise.all([
    db.from("contacts").select("*").eq("id", id).eq("workspace_id", ws.id).maybeSingle(),
    db.from("messages").select("*").eq("contact_id", id).order("created_at"),
    db.from("notes").select("*").eq("contact_id", id).order("created_at", { ascending: false }),
    db.from("tasks").select("*").eq("contact_id", id).order("created_at", { ascending: false }),
    db.from("stages").select("id,name").eq("workspace_id", ws.id).order("position"),
    db.from("email_templates").select("*").eq("workspace_id", ws.id).order("name"),
    db.from("custom_fields").select("*").eq("workspace_id", ws.id).order("label"),
    db.from("bookings").select("*").eq("contact_id", id).order("start_time", { ascending: false }),
    db.from("snippets").select("*").eq("workspace_id", ws.id).order("name"),
    db.from("call_logs").select("*").eq("contact_id", id).order("created_at", { ascending: false }).limit(30),
    db.from("message_events").select("*").eq("contact_id", id).order("created_at", { ascending: false }).limit(60),
  ]);
  const snip = (snippets ?? []).find((x) => x.id === snipId);
  const timeline = [
    ...(messages ?? []).map((m) => ({ at: m.created_at, text: `${m.direction === "out" ? "Sent" : "Received"} ${m.channel}${m.subject ? `: ${m.subject}` : ""} (${m.status})` })),
    ...(events ?? []).map((e) => ({ at: e.created_at, text: `Message ${e.type}${e.machine ? " (likely automated)" : ""}${e.url ? `: ${e.url}` : ""}` })),
    ...(notes ?? []).map((n) => ({ at: n.created_at, text: `Note: ${n.body}` })),
    ...(calls ?? []).map((k) => ({ at: k.created_at, text: `Call ${k.direction === "in" ? "from" : "to"} contact: ${k.status}${k.duration_seconds ? `, ${k.duration_seconds}s` : ""}` })),
    ...(bookings ?? []).map((b) => ({ at: b.created_at, text: `Booking ${b.status.replace("_", " ")}: ${new Date(b.start_time).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" })}` })),
    ...(tasks ?? []).map((k) => ({ at: k.created_at, text: `Task ${k.done ? "done" : "open"}: ${k.title}` })),
  ].sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 80);
  const tpl = (templates ?? []).find((x) => x.id === tplId);
  const { data: conn } = await (await import("@/lib/supabase/admin")).supabaseAdmin().from("mail_connections").select("account_email").eq("workspace_id", ws.id).maybeSingle();
  if (!c) notFound();

  const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || c.phone;
  const openTasks = (tasks ?? []).filter((t) => !t.done).length;

  return (
    <Page>
      <header className="card mb-6 flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar name={personName(c)} size="lg" />
          <div className="min-w-0">
            <h1 className="text-[22px] font-semibold leading-tight text-ink">{name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-2">
              {c.email && <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-faint" aria-hidden />{c.email}</span>}
              {c.phone && <span className="tabular inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-faint" aria-hidden />{c.phone}</span>}
              {c.company && <span className="inline-flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-faint" aria-hidden />{c.company}</span>}
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {c.email_opt_out && <Badge tone="danger">Email opted out</Badge>}
              {c.sms_opt_out && <Badge tone="danger">SMS opted out</Badge>}
              {c.consent_note && <span className="inline-flex items-center gap-1 text-xs text-muted"><ShieldCheck className="h-3.5 w-3.5" aria-hidden />Consent: {c.consent_note}</span>}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {c.phone && <form action={callContact}><input type="hidden" name="contact_id" value={c.id} /><button className="btn btn-secondary"><PhoneCall aria-hidden />Call {c.phone}</button></form>}
          <Modal trigger={<><Pencil aria-hidden />Edit</>} triggerClassName="btn btn-secondary" title="Edit, merge or delete" description={name}>
            <form action={updateContact} className="grid grid-cols-2 gap-3">
              <input type="hidden" name="contact_id" value={c.id} />
              <Field label="First name"><input name="first_name" defaultValue={c.first_name ?? ""} placeholder="First name" className="input" /></Field>
              <Field label="Last name"><input name="last_name" defaultValue={c.last_name ?? ""} placeholder="Last name" className="input" /></Field>
              <Field label="Email"><input name="email" defaultValue={c.email ?? ""} placeholder="Email" className="input" /></Field>
              <Field label="Phone"><input name="phone" defaultValue={c.phone ?? ""} placeholder="Phone" className="input" /></Field>
              <Field label="Company"><input name="company" defaultValue={c.company ?? ""} placeholder="Company" className="input" /></Field>
              <Field label="Tags"><input name="tags" defaultValue={c.tags.join(", ")} placeholder="Tags" className="input" /></Field>
              <Field label="Consent note" className="col-span-2"><input name="consent_note" defaultValue={c.consent_note ?? ""} placeholder="Consent note" className="input" /></Field>
              <label className="check-row"><input type="checkbox" name="email_opt_out" defaultChecked={c.email_opt_out} className="checkbox" />Email opted out</label>
              <label className="check-row"><input type="checkbox" name="sms_opt_out" defaultChecked={c.sms_opt_out} className="checkbox" />SMS opted out</label>
              <button className="btn btn-primary col-span-2 mt-1">Save changes</button>
            </form>
            <div className="mt-6 border-t border-line pt-5">
              <p className="label">Merge a duplicate</p>
              <form action={mergeContact} className="flex gap-2">
                <input type="hidden" name="contact_id" value={c.id} />
                <input name="other_email" placeholder="Duplicate's email, merged into this contact" aria-label="Duplicate's email" className="input flex-1" />
                <button className="btn btn-secondary">Merge</button>
              </form>
            </div>
            <div className="mt-5 flex items-center justify-between gap-4 rounded-[10px] border border-danger/25 bg-danger-bg/50 px-4 py-3">
              <p className="text-[13px] text-danger-ink">Deleting removes the contact and all of their history.</p>
              <form action={deleteContact}>
                <input type="hidden" name="contact_id" value={c.id} />
                <button className="btn btn-danger btn-sm border-danger/30">Delete this contact and its history</button>
              </form>
            </div>
          </Modal>
        </div>
      </header>

      {error && <Alert tone="danger">{error}</Alert>}
      {msg && <Alert tone="info">{msg}</Alert>}

      <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-6">
        <section className="flex min-w-0 flex-col gap-6">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <h2 className="flex items-center gap-2 text-[13px] font-semibold text-ink"><MessageSquare className="h-4 w-4 text-faint" aria-hidden />Conversation</h2>
              <span className="text-xs text-muted">{(messages ?? []).length} messages</span>
            </div>
            <ScrollEnd className="flex max-h-[30rem] flex-col gap-3 overflow-y-auto bg-sunken px-5 py-5">
              {(messages ?? []).length === 0 && <EmptyState icon={MessageSquare} title="No messages yet." className="!py-8">Send the first message below. Replies on any channel will appear here.</EmptyState>}
              {(messages ?? []).map((m) => (
                <div key={m.id} className={`flex max-w-[78%] flex-col gap-1 ${m.direction === "out" ? "items-end self-end" : "items-start self-start"}`}>
                  <div className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed shadow-xs ${m.direction === "out" ? "rounded-br-md bg-brand-soft text-ink" : "rounded-bl-md border border-line bg-surface text-ink"}`}>
                    {m.subject && <div className="mb-1 font-semibold">{m.subject}</div>}
                    {m.body}
                  </div>
                  <div className="flex items-center gap-1.5 px-1 text-[11px] text-muted">
                    <ChannelIcon channel={m.channel} size="sm" />
                    <span>{channelLabel(m.channel)}</span><span aria-hidden>·</span><span>{dateTime(m.created_at)}</span><span aria-hidden>·</span>
                    <span className={m.status === "failed" ? "font-semibold text-danger-ink" : ""}>{m.status}{m.error ? ` (${m.error})` : ""}</span>
                  </div>
                </div>
              ))}
            </ScrollEnd>
            <form action={sendMessage} className="flex flex-col gap-2.5 border-t border-line p-4">
              <input type="hidden" name="contact_id" value={c.id} />
              <div className="flex gap-2">
                <select name="channel" aria-label="Channel" className="select !w-auto">
                  <option value="sms">SMS</option>
                  <option value="email">Email (Resend)</option>
                  {conn && <option value="outlook">Email (Outlook: {conn.account_email})</option>}
                  <option value="whatsapp">WhatsApp</option>
                  {(c.custom ?? {}).messenger_psid ? <option value="messenger">Facebook Messenger</option> : null}
                  {(c.custom ?? {}).instagram_id ? <option value="instagram">Instagram DM</option> : null}
                </select>
                <input name="subject" defaultValue={tpl?.subject} placeholder="Subject (email only)" aria-label="Subject (email only)" className="input flex-1" />
              </div>
              <textarea name="body" rows={3} defaultValue={snip?.body ?? tpl?.body} placeholder="Message" aria-label="Message" required className="textarea" />
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 flex-col gap-1.5">
                  {(templates ?? []).length > 0 && <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted"><span className="w-16 shrink-0">Templates</span>{(templates ?? []).map((x) => <a key={x.id} className={`badge hover:text-ink ${x.id === tplId ? "badge-brand" : ""}`} href={`/contacts/${c.id}?t=${x.id}`}>{x.name}</a>)}</p>}
                  {(snippets ?? []).length > 0 && <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted"><span className="w-16 shrink-0">Snippets</span>{(snippets ?? []).map((x) => <a key={x.id} className={`badge hover:text-ink ${x.id === snipId ? "badge-brand" : ""}`} href={`/contacts/${c.id}?s=${x.id}`}>{x.name}</a>)}</p>}
                </div>
                <button className="btn btn-primary shrink-0"><Send aria-hidden />Send</button>
              </div>
            </form>
          </div>

          <details className="disclosure card p-5" open>
            <summary className="text-[13px]"><History className="h-4 w-4 text-faint" aria-hidden />Timeline ({timeline.length})</summary>
            <ul className="mt-4 flex max-h-[26rem] flex-col overflow-y-auto">
              {timeline.map((e, i) => (
                <li key={i} className="relative flex gap-3 pb-3.5 pl-5 text-[13px] last:pb-0">
                  <span aria-hidden className="absolute left-[3px] top-[7px] h-[7px] w-[7px] rounded-full bg-line-strong ring-4 ring-surface" />
                  {i < timeline.length - 1 && <span aria-hidden className="absolute bottom-0 left-[6px] top-4 w-px bg-line" />}
                  <span className="tabular w-28 shrink-0 text-xs leading-5 text-muted">{new Date(e.at).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "short", timeStyle: "short" })}</span>
                  <span className="min-w-0 break-words text-ink-2">{e.text}</span>
                </li>
              ))}
              {timeline.length === 0 && <li className="text-[13px] text-muted">Nothing has happened yet.</li>}
            </ul>
          </details>
        </section>

        <aside className="flex flex-col gap-4">
          {(bookings ?? []).length > 0 && (
            <div className="card p-4">
              <CardTitle icon={CalendarCheck}>Bookings</CardTitle>
              <div className="flex flex-col gap-2">
                {(bookings ?? []).map((b) => (
                  <form key={b.id} action={setBookingOutcome} className="well p-3 text-[13px]">
                    <input type="hidden" name="booking_id" value={b.id} /><input type="hidden" name="contact_id" value={c.id} />
                    <div className="flex items-center justify-between gap-2"><span className="font-medium text-ink">{new Date(b.start_time).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" })}</span><StatusBadge status={b.status} label={humanise(b.status)} /></div>
                    <div className="mt-0.5 text-xs text-muted">{b.title}</div>
                    {b.status !== "cancelled" && (
                      <div className="mt-2 flex gap-1.5">
                        <button name="status" value="attended" className="btn btn-secondary btn-sm">Attended</button>
                        <button name="status" value="no_show" className="btn btn-secondary btn-sm">No-show</button>
                      </div>
                    )}
                  </form>
                ))}
              </div>
            </div>
          )}

          <div className="card p-4">
            <CardTitle icon={Tag}>Tags</CardTitle>
            {c.tags.length > 0 && <div className="mb-3 flex flex-wrap gap-1">{c.tags.map((t: string) => <span key={t} className="badge">{t}</span>)}</div>}
            <form action={addTag} className="flex gap-1.5"><input type="hidden" name="contact_id" value={c.id} /><input name="tag" placeholder="Add tag" aria-label="Add tag" className="input input-sm flex-1" /><button className="btn btn-secondary btn-sm">Add</button></form>
          </div>

          <div className="card p-4">
            <CardTitle icon={ListChecks} aside={openTasks > 0 ? <Badge tone="brand">{openTasks} open</Badge> : undefined}>Tasks</CardTitle>
            {(tasks ?? []).length > 0 && (
              <ul className="mb-3 flex flex-col gap-0.5">
                {(tasks ?? []).map((t) => (
                  <li key={t.id}>
                    <form action={toggleTask}>
                      <input type="hidden" name="id" value={t.id} /><input type="hidden" name="contact_id" value={c.id} /><input type="hidden" name="done" value={String(!t.done)} />
                      <button className="-mx-1.5 flex w-[calc(100%+0.75rem)] items-start gap-2 rounded-md px-1.5 py-1 text-left text-[13px] hover:bg-subtle" title={t.done ? "Mark as not done" : "Mark as done"}>
                        {t.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-text" aria-hidden /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-faint" aria-hidden />}
                        <span className={t.done ? "text-faint line-through" : "text-ink"}>{t.title}</span>
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <form action={addTask} className="flex flex-col gap-1.5"><input type="hidden" name="contact_id" value={c.id} /><input name="title" placeholder="New task" aria-label="New task" required className="input input-sm" /><div className="flex gap-1.5"><input name="due_at" type="datetime-local" aria-label="Due" className="input input-sm flex-1" /><button className="btn btn-secondary btn-sm">Add task</button></div></form>
          </div>

          <div className="card p-4">
            <CardTitle icon={StickyNote}>Notes</CardTitle>
            <form action={addNote} className="mb-3 flex flex-col gap-1.5"><input type="hidden" name="contact_id" value={c.id} /><textarea name="body" rows={2} required placeholder="Write a note" aria-label="Note" className="textarea" /><button className="btn btn-secondary btn-sm self-start">Save note</button></form>
            <div className="flex flex-col gap-2">
              {(notes ?? []).map((n) => <p key={n.id} className="whitespace-pre-wrap break-words rounded-lg border-l-2 border-warning-ink/40 bg-warning-bg/60 px-3 py-2 text-[13px] leading-relaxed text-ink-2">{n.body}</p>)}
            </div>
          </div>

          <div className="card p-4">
            <CardTitle icon={KanbanSquare}>Add to pipeline</CardTitle>
            <form action={createOpportunity} className="flex flex-col gap-1.5">
              <input type="hidden" name="contact_id" value={c.id} />
              <input name="title" placeholder="Opportunity title" aria-label="Opportunity title" className="input input-sm" />
              <div className="flex gap-1.5">
                <input name="value" type="number" step="0.01" placeholder="Value (£)" aria-label="Value in pounds" className="input input-sm" />
                <select name="stage_id" aria-label="Stage" className="select input-sm">{(stages ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              </div>
              <button className="btn btn-secondary btn-sm">Add</button>
            </form>
          </div>

          {(fields ?? []).length > 0 && (
            <div className="card p-4">
              <CardTitle icon={SlidersHorizontal}>Custom fields</CardTitle>
              <form action={saveCustomValues} className="flex flex-col gap-2.5">
                <input type="hidden" name="contact_id" value={c.id} />
                {(fields ?? []).map((f) => (
                  <label key={f.id} className="block"><span className="label !mb-1 !text-xs !font-medium !text-muted">{f.label}</span>
                    {f.type === "select" ? (
                      <select name={`cf_${f.key}`} defaultValue={String((c.custom ?? {})[f.key] ?? "")} className="select input-sm"><option value="" />{f.options.map((o: string) => <option key={o}>{o}</option>)}</select>
                    ) : (
                      <input name={`cf_${f.key}`} type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} defaultValue={String((c.custom ?? {})[f.key] ?? "")} className="input input-sm" />
                    )}
                  </label>
                ))}
                <button className="btn btn-secondary btn-sm self-start">Save fields</button>
              </form>
            </div>
          )}
        </aside>
      </div>
    </Page>
  );
}
