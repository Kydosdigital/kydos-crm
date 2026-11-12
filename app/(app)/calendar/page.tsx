import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { createShare, deletePost, deleteShare, savePost, setPostStatus } from "../../actions";

const STATUS: Record<string, string> = { draft: "Draft", awaiting_approval: "Awaiting client", approved: "Approved", changes_requested: "Changes requested", published: "Published" };

export default async function Calendar({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const [{ data: posts }, { data: shares }] = await Promise.all([
    db.from("content_posts").select("*").eq("workspace_id", ws.id).order("scheduled_at").limit(300),
    db.from("calendar_shares").select("*").eq("workspace_id", ws.id).order("created_at"),
  ]);
  const app = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const day = (d: string) => new Date(d).toLocaleDateString("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short" });
  const time = (d: string) => new Date(d).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });
  const byDay = new Map<string, typeof posts>();
  for (const p of posts ?? []) { const k = day(p.scheduled_at); byDay.set(k, [...(byDay.get(k) ?? []), p]); }
  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 text-2xl font-semibold">Content calendar</h1>
      <p className="mb-4 text-sm text-gray-500">Plan posts for each client, send them a private read-only link, and they can approve or ask for changes without logging in. Publishing to Facebook and Instagram can be added later.</p>
      {error && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      <h2 className="mb-2 font-semibold">Client share links</h2>
      {(shares ?? []).map((s) => (
        <div key={s.token} className="mb-1 flex justify-between rounded border p-2 text-sm">
          <span><b>{s.client}</b> <a className="ml-2 underline" target="_blank" href={`${app}/f/cal/${s.token}`}>{`${app}/f/cal/${s.token}`}</a></span>
          <form action={deleteShare}><input type="hidden" name="token" value={s.token} /><button className="text-xs underline">Revoke</button></form>
        </div>
      ))}
      <form action={createShare} className="mb-8 mt-2 flex gap-2 text-sm"><input name="client" required placeholder="Client name, must match the posts" className="flex-1 rounded border p-2" /><button className="rounded border px-3">Create link</button></form>

      <h2 className="mb-2 font-semibold">Posts</h2>
      {[...byDay.entries()].map(([d, list]) => (
        <div key={d} className="mb-3"><div className="mb-1 text-xs font-semibold uppercase text-gray-500">{d}</div>
          {(list ?? []).map((p) => (
            <div key={p.id} className="mb-1 rounded border p-2 text-sm">
              <div className="flex justify-between"><span><b>{p.client}</b> · {p.platform} · {time(p.scheduled_at)} · <span className="font-medium">{STATUS[p.status]}</span></span>
                <span className="flex gap-2 text-xs">
                  <form action={setPostStatus} className="flex gap-1"><input type="hidden" name="id" value={p.id} />
                    <select name="status" defaultValue={p.status} className="rounded border p-0.5">{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><button className="underline">Set</button></form>
                  <form action={deletePost}><input type="hidden" name="id" value={p.id} /><button className="underline">Delete</button></form></span></div>
              <p className="mt-1 whitespace-pre-wrap text-gray-700">{p.caption}</p>
              {p.client_comment && <p className="mt-1 rounded bg-yellow-50 p-1 text-xs">Client: {p.client_comment}</p>}
            </div>
          ))}
        </div>
      ))}
      <form action={savePost} className="mt-4 grid grid-cols-3 gap-2 text-sm">
        <input name="client" required placeholder="Client" className="rounded border p-2" />
        <select name="platform" className="rounded border p-2"><option>facebook</option><option>instagram</option><option>linkedin</option><option>tiktok</option><option>x</option><option>google business</option></select>
        <input name="scheduled_at" type="datetime-local" required className="rounded border p-2" />
        <textarea name="caption" required rows={3} placeholder="Caption" className="col-span-3 rounded border p-2" />
        <input name="media_url" placeholder="Image or video link (optional)" className="col-span-2 rounded border p-2" />
        <label><input type="checkbox" name="for_approval" className="mr-1" />Ready for client approval</label>
        <button className="col-span-3 rounded bg-black px-3 py-2 text-white">Add post</button>
      </form>
    </div>
  );
}
