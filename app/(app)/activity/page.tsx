import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";

export default async function Activity() {
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const [{ data: log }, { data: calls }] = await Promise.all([
    db.from("activity_log").select("*").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(100),
    db.from("call_logs").select("*, contacts(id,first_name,last_name)").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(30),
  ]);
  const t = (d: string) => new Date(d).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "short", timeStyle: "short" });
  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 text-2xl font-semibold">Activity and calls</h1>
      <p className="mb-4 text-sm text-gray-500">Who changed what, plus every call. <a href="/api/backup" className="underline">Download a full backup (JSON)</a>. A copy is also saved automatically every night and the last 14 are kept.</p>
      <h2 className="mb-2 font-semibold">Calls</h2>
      <table className="mb-8 w-full text-left text-sm"><tbody>
        {(calls ?? []).length === 0 && <tr><td className="text-gray-500">No calls yet. Set your Twilio call number in Settings.</td></tr>}
        {(calls ?? []).map((k) => { const c = k.contacts as { id: string; first_name: string | null; last_name: string | null } | null; return (
          <tr key={k.id} className="border-b"><td className="py-1 text-gray-500">{t(k.created_at)}</td><td>{k.direction === "in" ? "Incoming" : "Outgoing"}</td><td>{c ? <Link className="underline" href={`/contacts/${c.id}`}>{[c.first_name, c.last_name].filter(Boolean).join(" ") || k.from_number}</Link> : (k.from_number ?? k.to_number)}</td><td>{k.status}{k.duration_seconds ? ` ${k.duration_seconds}s` : ""}</td></tr>); })}
      </tbody></table>
      <h2 className="mb-2 font-semibold">Activity log</h2>
      <table className="w-full text-left text-sm"><tbody>
        {(log ?? []).map((a) => <tr key={a.id} className="border-b"><td className="py-1 text-gray-500">{t(a.created_at)}</td><td>{a.actor}</td><td>{a.action}</td><td className="text-gray-500">{a.detail}</td></tr>)}
      </tbody></table>
    </div>
  );
}
