import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { cancelScheduled, sendBroadcast } from "../../actions";

export default async function Broadcast({ searchParams }: { searchParams: Promise<{ tag?: string; list?: string; error?: string; done?: string; scheduled?: string }> }) {
  const { tag, list, error, done, scheduled } = await searchParams;
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  let count: number | null = null;
  let listName: string | null = null;
  if (list) {
    const { data: l } = await db.from("smart_lists").select("*").eq("id", list).eq("workspace_id", ws.id).maybeSingle();
    if (l) {
      listName = l.name;
      count = (await (await import("@/lib/lists")).matchList(ws.id, l.filter)).filter((c) => c.email && !c.email_opt_out).length;
    }
  } else if (tag) {
    const r = await db.from("contacts").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id).contains("tags", [tag]).eq("email_opt_out", false).not("email", "is", null);
    count = r.count ?? 0;
  }
  const { data: queue } = await db.from("scheduled_sends").select("*").eq("workspace_id", ws.id).order("send_at", { ascending: false }).limit(10);
  return (
    <div className="max-w-2xl">
      <h1 className="mb-4 text-2xl font-semibold">Bulk email</h1>
      {error && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      {scheduled && <p className="mb-3 rounded bg-green-50 p-2 text-sm text-green-700">Scheduled. It will send automatically.</p>}
      {done && <p className="mb-3 rounded bg-green-50 p-2 text-sm text-green-700">Sent to {done} contacts.</p>}
      <form className="mb-4 flex gap-2">
        <input name="tag" defaultValue={tag} placeholder="Tag to email" className="flex-1 rounded border p-2" />
        <button className="rounded border px-3">Check recipients</button>
      </form>
      {count !== null && <p className="mb-4 text-sm text-gray-700">{count} contacts with this tag can be emailed (opted-out contacts are excluded). Each send is capped at 90 to stay inside the free Resend daily limit of 100.</p>}
      <form action={sendBroadcast} className="flex flex-col gap-2">
        {list ? <><input type="hidden" name="list" value={list} /><p className="text-sm">Sending to smart list: <b>{listName}</b></p></> : <input name="tag" defaultValue={tag} placeholder="Tag" required className="rounded border p-2" />}
        <input name="subject" placeholder="Subject" required className="rounded border p-2" />
        <textarea name="body" rows={8} placeholder="Message. You can use {{first_name}}." required className="rounded border p-2" />
        <label className="text-sm"><input type="checkbox" name="confirm" className="mr-2" />These contacts have opted in to marketing email (PECR)</label>
        <label className="text-sm">Schedule for later (UK time, leave empty to send now) <input type="datetime-local" name="send_at" className="ml-2 rounded border p-1" /></label>
        <button className="self-start rounded bg-black px-4 py-2 text-white">Send or schedule</button>
      </form>
      {(queue ?? []).length > 0 && (
        <div className="mt-8"><h2 className="mb-2 font-semibold">Scheduled and recent sends</h2>
          {(queue ?? []).map((q) => (
            <div key={q.id} className="mb-1 flex justify-between rounded border p-2 text-sm">
              <span>{q.subject} <span className="text-gray-500">({q.tag ?? "smart list"}) · {new Date(q.send_at).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "short", timeStyle: "short" })} · {q.status}{q.status === "sent" ? ` (${q.sent_count})` : ""}</span></span>
              {q.status === "scheduled" && <form action={cancelScheduled}><input type="hidden" name="id" value={q.id} /><button className="text-xs underline">Cancel</button></form>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
