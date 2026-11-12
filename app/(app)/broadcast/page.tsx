import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { cancelScheduled, sendBroadcast } from "../../actions";
import { Clock, Send, Users } from "lucide-react";
import { Alert, Card, CardTitle, ChannelIcon, Field, Page, PageHeader, Section, StatusBadge } from "@/components/ui";

export default async function Broadcast({ searchParams }: { searchParams: Promise<{ tag?: string; list?: string; error?: string; done?: string; of?: string; scheduled?: string; channel?: string }> }) {
  const { tag, list, error, done, of, scheduled, channel: ch } = await searchParams;
  const channel = (ch === "sms" || ch === "whatsapp" ? ch : "email") as "email" | "sms" | "whatsapp";
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  let count: number | null = null;
  let listName: string | null = null;
  if (list) {
    const { data: l } = await db.from("smart_lists").select("name").eq("id", list).eq("workspace_id", ws.id).maybeSingle();
    listName = l?.name ?? null;
  }
  if (list || tag) count = (await (await import("@/lib/campaign")).audience(ws.id, { tag, listId: list }, channel)).total;
  const CAPS = { email: 90, sms: 100, whatsapp: 100 };
  const { data: queue } = await db.from("scheduled_sends").select("*").eq("workspace_id", ws.id).order("send_at", { ascending: false }).limit(10);
  return (
    <Page>
      <PageHeader title="Bulk campaigns" description="Send one message to everyone with a tag or in a smart list, by email, SMS or WhatsApp. Opted-out contacts are always excluded." />
      {error && <Alert tone="danger">{error}</Alert>}
      {scheduled && <Alert tone="success">Scheduled. It will send automatically.</Alert>}
      {done && <Alert tone="success">Sent to {done}{of ? ` of ${of}` : ""} contacts.</Alert>}
      <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-6">
        <div className="flex flex-col gap-4">
          <Card>
            <CardTitle icon={Users}>1. Audience</CardTitle>
            <form className="flex items-end gap-2">
              <Field label="Channel" className="w-40"><select name="channel" defaultValue={channel} className="select"><option value="email">Email</option><option value="sms">SMS</option><option value="whatsapp">WhatsApp</option></select></Field>
              {list ? <input type="hidden" name="list" value={list} /> : <Field label="Tag" className="flex-1"><input name="tag" defaultValue={tag} placeholder="Tag to message" className="input" /></Field>}
              <button className="btn btn-secondary">Check recipients</button>
            </form>
            {count !== null && <p className="alert alert-info mt-4"><Users aria-hidden /><span><b className="font-semibold">{count} contacts</b> can receive this {channel} campaign (opted-out and missing {channel === "email" ? "emails" : "numbers"} excluded). Each send is capped at {CAPS[channel]}.{channel === "sms" && " SMS costs about 4p per message part."}{channel === "whatsapp" && " WhatsApp marketing templates are charged by Meta per message."}</span></p>}
          </Card>
          <Card>
            <CardTitle icon={Send} aside={<ChannelIcon channel={channel} label />}>2. Message</CardTitle>
            <form action={sendBroadcast} className="flex flex-col gap-3">
              <input type="hidden" name="channel" value={channel} />
              {list ? <><input type="hidden" name="list" value={list} /><p className="text-[13px] text-ink-2">Sending to smart list: <b className="font-semibold text-ink">{listName}</b></p></> : <Field label="Tag"><input name="tag" defaultValue={tag} placeholder="Tag" required className="input" /></Field>}
              {channel === "email" && <Field label="Subject"><input name="subject" placeholder="Subject" required className="input" /></Field>}
              {channel === "whatsapp" && <div className="flex gap-3"><Field label="Template" className="flex-1"><input name="wa_template" placeholder="Approved template name, e.g. lead_followup" required className="input" /></Field><Field label="Language" className="w-28"><input name="wa_lang" defaultValue="en_GB" className="input" /></Field></div>}
              <Field label={channel === "whatsapp" ? "Template variables" : "Message"}>
                <textarea name="body" rows={channel === "email" ? 8 : 4} placeholder={channel === "whatsapp" ? "Template variables, one per line, filling {{1}}, {{2}} in order. You can use {{first_name}}." : channel === "sms" ? "Message (keep it short). You can use {{first_name}}. 'Reply STOP to opt out' is added for you." : "Message. You can use {{first_name}}."} required={channel !== "whatsapp"} className="textarea" />
              </Field>
              <label className="check-row"><input type="checkbox" name="confirm" className="checkbox" />These contacts have opted in to marketing by {channel === "email" ? "email" : channel === "sms" ? "text" : "WhatsApp"} (PECR)</label>
              <div className="flex flex-wrap items-end justify-between gap-3 border-t border-line pt-4">
                <label className="block"><span className="label">Schedule for later (UK time, leave empty to send now)</span><input type="datetime-local" name="send_at" className="input !w-60" /></label>
                <button className="btn btn-primary"><Send aria-hidden />Send or schedule</button>
              </div>
            </form>
          </Card>
        </div>
        <Section title="Scheduled and recent sends">
          {(queue ?? []).length === 0 && <div className="well px-4 py-8 text-center text-[13px] text-muted">Nothing sent or scheduled yet.</div>}
          {(queue ?? []).length > 0 && (
            <div className="flex flex-col gap-2">
              {(queue ?? []).map((q) => (
                <div key={q.id} className="card p-3.5 text-[13px]">
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2"><ChannelIcon channel={q.channel} size="sm" /><span className="truncate font-medium text-ink">{q.subject ?? q.wa_template ?? (q.body ?? "").slice(0, 40)}</span></span>
                    <StatusBadge status={q.status} label={<>{q.status}{q.status === "sent" ? ` (${q.sent_count})` : ""}</>} />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden />{new Date(q.send_at).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "short", timeStyle: "short" })} · {q.tag ?? "smart list"}</span>
                    {q.status === "scheduled" && <form action={cancelScheduled}><input type="hidden" name="id" value={q.id} /><button className="btn btn-danger btn-sm">Cancel</button></form>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </Page>
  );
}
