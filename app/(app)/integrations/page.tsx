import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { inspect } from "@/lib/integrations";
import { syncFacebookNow } from "../../actions";

export const dynamic = "force-dynamic";
const BADGE = { connected: "bg-green-100 text-green-800", needs_setup: "bg-gray-100 text-gray-700", error: "bg-red-100 text-red-800" } as const;
const LABEL = { connected: "Connected", needs_setup: "Needs setup", error: "Problem" } as const;
const when = (d: string | null) => (d ? new Date(d).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "short", timeStyle: "short" }) : "No activity yet");

export default async function Integrations({ searchParams }: { searchParams: Promise<{ channel?: string; synced?: string; error?: string }> }) {
  const { channel, synced, error } = await searchParams;
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  let q = db.from("messages").select("id,channel,direction,subject,body,status,created_at,contact_id,contacts(first_name,last_name,email)").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(60);
  if (channel) q = q.eq("channel", channel);
  const [items, feed, calls] = await Promise.all([
    inspect(ws.id),
    q,
    db.from("call_logs").select("id,direction,status,from_number,to_number,created_at,contact_id,contacts(first_name,last_name,email)").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(15),
  ]);
  type Row = { key: string; at: string; channel: string; dir: string; who: string; contactId: string | null; text: string; status: string };
  const nm = (c: unknown) => { const x = c as { first_name: string | null; last_name: string | null; email: string | null } | null; return [x?.first_name, x?.last_name].filter(Boolean).join(" ") || x?.email || "Unknown"; };
  const rows: Row[] = [
    ...((feed.data ?? []) as unknown as { id: string; channel: string; direction: string; subject: string | null; body: string | null; status: string; created_at: string; contact_id: string; contacts: unknown }[]).map((m) => ({ key: m.id, at: m.created_at, channel: m.channel, dir: m.direction, who: nm(m.contacts), contactId: m.contact_id, text: (m.subject ? m.subject + ": " : "") + (m.body ?? ""), status: m.status })),
    ...(channel && channel !== "call" ? [] : ((calls.data ?? []) as unknown as { id: string; direction: string; status: string | null; from_number: string | null; to_number: string | null; created_at: string; contact_id: string | null; contacts: unknown }[]).map((c) => ({ key: c.id, at: c.created_at, channel: "call", dir: c.direction, who: c.contacts ? nm(c.contacts) : (c.direction === "in" ? c.from_number : c.to_number) ?? "Unknown", contactId: c.contact_id, text: `Call ${c.status ?? ""}`, status: c.status ?? "" }))),
  ].filter((r) => !channel || r.channel === channel).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 60);
  const chans = ["email", "sms", "whatsapp", "messenger", "instagram", "call"];
  return (
    <div className="max-w-5xl">
      <h1 className="mb-1 text-2xl font-semibold">Integrations and interactions</h1>
      <p className="mb-4 text-sm text-gray-500">Every connected service with a live health check, and every interaction across all channels in one feed. Reload the page to re-run the checks.</p>
      {synced && <p className="mb-3 rounded bg-green-50 p-2 text-sm text-green-700">Facebook and Instagram sync finished: {synced} new message(s) imported.</p>}
      {error && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <div className="mb-8 grid gap-3 md:grid-cols-2">
        {items.map((i) => (
          <div key={i.key} className="rounded-lg border p-3 text-sm">
            <div className="flex items-center justify-between"><b>{i.name}</b><span className={`rounded px-2 py-0.5 text-xs ${BADGE[i.status]}`}>{LABEL[i.status]}</span></div>
            <p className="text-gray-600">{i.what}</p>
            <p className="mt-1 text-xs text-gray-500">{i.detail}</p>
            <p className="text-xs text-gray-500">Last activity: {when(i.last)}</p>
            {i.status !== "connected" && <p className="mt-1 text-xs text-amber-700">{i.setup}</p>}
            {i.syncable && <form action={syncFacebookNow} className="mt-2"><button className="rounded border px-2 py-1 text-xs">Sync Facebook and Instagram now</button></form>}
          </div>
        ))}
      </div>
      <h2 className="mb-2 font-semibold">All interactions</h2>
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        <Link href="/integrations" className={`rounded border px-2 py-1 ${!channel ? "bg-black text-white" : ""}`}>All</Link>
        {chans.map((c) => <Link key={c} href={`/integrations?channel=${c}`} className={`rounded border px-2 py-1 capitalize ${channel === c ? "bg-black text-white" : ""}`}>{c}</Link>)}
      </div>
      <table className="w-full text-left text-sm"><tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-b align-top">
            <td className="whitespace-nowrap py-2 pr-3 text-xs text-gray-500">{when(r.at)}</td>
            <td className="pr-3 text-xs capitalize">{r.channel}<br /><span className="text-gray-400">{r.dir === "in" ? "received" : "sent"}</span></td>
            <td className="pr-3">{r.contactId ? <Link href={`/contacts/${r.contactId}`} className="underline">{r.who}</Link> : r.who}</td>
            <td className="text-gray-600">{r.text.slice(0, 140)}</td>
            <td className="text-xs text-gray-400">{r.status}</td>
          </tr>
        ))}
        {rows.length === 0 && <tr><td className="py-4 text-gray-500">Nothing here yet.</td></tr>}
      </tbody></table>
    </div>
  );
}
