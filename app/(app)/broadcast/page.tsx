import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { cancelScheduled, sendBroadcast } from "../../actions";

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
    <div className="max-w-2xl">
      <h1 className="mb-4 text-2xl font-semibold">Bulk campaigns</h1>
      {error && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      {scheduled && <p className="mb-3 rounded bg-green-50 p-2 text-sm text-green-700">Scheduled. It will send automatically.</p>}
      {done && <p className="mb-3 rounded bg-green-50 p-2 text-sm text-green-700">Sent to {done}{of ? ` of ${of}` : ""} contacts.</p>}
      <form className="mb-4 flex gap-2">
        <select name="channel" defaultValue={channel} className="rounded border p-2"><option value="email">Email</option><option value="sms">SMS</option><option value="whatsapp">WhatsApp</option></select>
        {list ? <input type="hidden" name="list" value={list} /> : <input name="tag" defaultValue={tag} placeholder="Tag to message" className="flex-1 rounded border p-2" />}
        <button className="rounded border px-3">Check recipients</button>
      </form>
      {count !== null && <p className="mb-4 text-sm text-gray-700">{count} contacts can receive this {channel} campaign (opted-out and missing {channel === "email" ? "emails" : "numbers"} excluded). Each send is capped at {CAPS[channel]}.{channel === "sms" && " SMS costs about 4p per message part."}{channel === "whatsapp" && " WhatsApp marketing templates are charged by Meta per message."}</p>}
      <form action={sendBroadcast} className="flex flex-col gap-2">
        <input type="hidden" name="channel" value={channel} />
        {list ? <><input type="hidden" name="list" value={list} /><p className="text-sm">Sending to smart list: <b>{listName}</b></p></> : <input name="tag" defaultValue={tag} placeholder="Tag" required className="rounded border p-2" />}
        {channel === "email" && <input name="subject" placeholder="Subject" required className="rounded border p-2" />}
        {channel === "whatsapp" && <div className="flex gap-2"><input name="wa_template" placeholder="Approved template name, e.g. lead_followup" required className="flex-1 rounded border p-2" /><input name="wa_lang" defaultValue="en_GB" className="w-24 rounded border p-2" /></div>}
        <textarea name="body" rows={channel === "email" ? 8 : 4} placeholder={channel === "whatsapp" ? "Template variables, one per line, filling {{1}}, {{2}} in order. You can use {{first_name}}." : channel === "sms" ? "Message (keep it short). You can use {{first_name}}. 'Reply STOP to opt out' is added for you." : "Message. You can use {{first_name}}."} required={channel !== "whatsapp"} className="rounded border p-2" />
        <label className="text-sm"><input type="checkbox" name="confirm" className="mr-2" />These contacts have opted in to marketing by {channel === "email" ? "email" : channel === "sms" ? "text" : "WhatsApp"} (PECR)</label>
        <label className="text-sm">Schedule for later (UK time, leave empty to send now) <input type="datetime-local" name="send_at" className="ml-2 rounded border p-1" /></label>
        <button className="self-start rounded bg-black px-4 py-2 text-white">Send or schedule</button>
      </form>
      {(queue ?? []).length > 0 && (
        <div className="mt-8"><h2 className="mb-2 font-semibold">Scheduled and recent sends</h2>
          {(queue ?? []).map((q) => (
            <div key={q.id} className="mb-1 flex justify-between rounded border p-2 text-sm">
              <span>{q.channel !== "email" && <b className="mr-1 uppercase">{q.channel}</b>}{q.subject ?? q.wa_template ?? (q.body ?? "").slice(0, 40)} <span className="text-gray-500">({q.tag ?? "smart list"}) · {new Date(q.send_at).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "short", timeStyle: "short" })} · {q.status}{q.status === "sent" ? ` (${q.sent_count})` : ""}</span></span>
              {q.status === "scheduled" && <form action={cancelScheduled}><input type="hidden" name="id" value={q.id} /><button className="text-xs underline">Cancel</button></form>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
