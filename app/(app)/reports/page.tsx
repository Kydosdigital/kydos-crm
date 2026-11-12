import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import Link from "next/link";

const ago = (d: number) => new Date(Date.now() - d * 864e5).toISOString();
const gbp = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;
const median = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);
const mins = (m: number | null) => (m === null ? "n/a" : m < 60 ? `${Math.round(m)} min` : m < 1440 ? `${(m / 60).toFixed(1)} h` : `${(m / 1440).toFixed(1)} days`);
const Bar = ({ v, max }: { v: number; max: number }) => <div className="h-2 rounded bg-[#1f3a5f]" style={{ width: `${max ? Math.max(2, (v / max) * 100) : 0}%` }} />;

export default async function Reports({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { ws } = await requireWorkspace();
  const days = Math.min(365, Math.max(7, Number((await searchParams).days) || 30));
  const db = await supabaseServer();
  const since = ago(days);
  const [{ data: contacts }, { data: opps }, { data: stages }, { data: bookings }, { data: firstOut }] = await Promise.all([
    db.from("contacts").select("id,source,tags,created_at").eq("workspace_id", ws.id).gte("created_at", since).limit(10000),
    db.from("opportunities").select("id,value,status,stage_id,created_at,closed_at,contact_id").eq("workspace_id", ws.id).limit(10000),
    db.from("stages").select("id,name,position").eq("workspace_id", ws.id).order("position"),
    db.from("bookings").select("id,contact_id,status,start_time,created_at").eq("workspace_id", ws.id).gte("created_at", ago(90)).limit(10000),
    db.from("messages").select("contact_id,created_at").eq("workspace_id", ws.id).eq("direction", "out").neq("status", "failed").gte("created_at", since).order("created_at").limit(20000),
  ]);

  // Lead sources
  const bookedIds = new Set((bookings ?? []).filter((b) => b.status !== "cancelled").map((b) => b.contact_id));
  const wonIds = new Set((opps ?? []).filter((o) => o.status === "won").map((o) => o.contact_id));
  const src = new Map<string, { leads: number; booked: number; won: number }>();
  for (const c of contacts ?? []) {
    const k = c.source ?? "unknown";
    const r = src.get(k) ?? { leads: 0, booked: 0, won: 0 };
    r.leads++;
    if (bookedIds.has(c.id) || (c.tags ?? []).includes("booked")) r.booked++;
    if (wonIds.has(c.id)) r.won++;
    src.set(k, r);
  }
  const sources = [...src.entries()].sort((a, b) => b[1].leads - a[1].leads);
  const maxLeads = Math.max(1, ...sources.map(([, v]) => v.leads));

  // Speed to first reply
  const first = new Map<string, string>();
  for (const m of firstOut ?? []) if (!first.has(m.contact_id)) first.set(m.contact_id, m.created_at);
  const waits = (contacts ?? []).filter((c) => first.has(c.id)).map((c) => Math.max(0, (Date.parse(first.get(c.id)!) - Date.parse(c.created_at)) / 60000));
  const never = (contacts ?? []).length - waits.length;

  // Pipeline
  const open = (opps ?? []).filter((o) => o.status === "open");
  const stageRows = (stages ?? []).map((s) => ({ name: s.name, n: open.filter((o) => o.stage_id === s.id).length, v: open.filter((o) => o.stage_id === s.id).reduce((t, o) => t + Number(o.value), 0) }));
  const maxStage = Math.max(1, ...stageRows.map((s) => s.v));
  const won = (opps ?? []).filter((o) => o.status === "won"), lost = (opps ?? []).filter((o) => o.status === "lost");
  const winRate = won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 100) : null;
  const monthly = new Map<string, number>();
  for (const o of won) { const k = (o.closed_at ?? o.created_at).slice(0, 7); monthly.set(k, (monthly.get(k) ?? 0) + Number(o.value)); }
  const months = [...monthly.entries()].sort().slice(-6);
  const maxMonth = Math.max(1, ...months.map(([, v]) => v));

  // Bookings per week + show rate
  const weeks = new Map<string, number>();
  for (const b of bookings ?? []) { const d = new Date(b.created_at); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); const k = d.toISOString().slice(5, 10); weeks.set(k, (weeks.get(k) ?? 0) + 1); }
  const wk = [...weeks.entries()].sort().slice(-8);
  const maxWk = Math.max(1, ...wk.map(([, v]) => v));
  const att = (bookings ?? []).filter((b) => b.status === "attended").length, ns = (bookings ?? []).filter((b) => b.status === "no_show").length;

  return (
    <div className="max-w-5xl">
      <div className="mb-4 flex items-end justify-between">
        <div><h1 className="text-2xl font-semibold">Reports</h1><p className="text-sm text-gray-500">{ws.name}. Leads and replies for the last {days} days. See Analytics for email and WhatsApp engagement.</p></div>
        <div className="flex gap-2 text-sm">{[30, 90, 365].map((d) => <Link key={d} href={`/reports?days=${d}`} className={`rounded border px-2 py-1 ${d === days ? "bg-black text-white" : ""}`}>{d}d</Link>)}</div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[["New leads", String((contacts ?? []).length)], ["Median time to first message", mins(median(waits))], ["Never contacted", String(never)], ["Win rate", winRate === null ? "n/a" : `${winRate}%`]].map(([l, v]) => (
          <div key={l} className="rounded border p-3"><div className="text-xs text-gray-500">{l}</div><div className="text-xl font-semibold">{v}</div></div>
        ))}
      </div>

      <h2 className="mb-2 font-semibold">Lead sources</h2>
      <table className="mb-6 w-full text-left text-sm"><thead className="border-b text-gray-500"><tr><th className="py-1">Source</th><th className="w-1/3">Leads</th><th>Booked</th><th>Won</th></tr></thead><tbody>
        {sources.map(([k, v]) => <tr key={k} className="border-b"><td className="py-1">{k}</td><td><div className="flex items-center gap-2"><div className="w-full"><Bar v={v.leads} max={maxLeads} /></div>{v.leads}</div></td><td>{v.booked} ({v.leads ? Math.round((v.booked / v.leads) * 100) : 0}%)</td><td>{v.won}</td></tr>)}
        {!sources.length && <tr><td colSpan={4} className="py-2 text-gray-500">No leads in this period.</td></tr>}
      </tbody></table>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="mb-2 font-semibold">Open pipeline by stage</h2>
          <table className="w-full text-left text-sm"><tbody>
            {stageRows.map((s) => <tr key={s.name} className="border-b"><td className="py-1">{s.name}</td><td className="w-1/3"><Bar v={s.v} max={maxStage} /></td><td>{s.n}</td><td className="text-right">{gbp(s.v)}</td></tr>)}
            <tr className="font-semibold"><td className="py-1" colSpan={2}>Total open</td><td>{open.length}</td><td className="text-right">{gbp(open.reduce((t, o) => t + Number(o.value), 0))}</td></tr>
          </tbody></table>
        </div>
        <div>
          <h2 className="mb-2 font-semibold">Won revenue by month</h2>
          <table className="w-full text-left text-sm"><tbody>
            {months.map(([m, v]) => <tr key={m} className="border-b"><td className="py-1">{m}</td><td className="w-1/2"><Bar v={v} max={maxMonth} /></td><td className="text-right">{gbp(v)}</td></tr>)}
            {!months.length && <tr><td className="py-2 text-gray-500">No won deals yet. Move an opportunity to Won to see revenue.</td></tr>}
          </tbody></table>
        </div>
        <div>
          <h2 className="mb-2 font-semibold">Bookings per week (week starting)</h2>
          <table className="w-full text-left text-sm"><tbody>
            {wk.map(([w, n]) => <tr key={w} className="border-b"><td className="py-1">{w}</td><td className="w-1/2"><Bar v={n} max={maxWk} /></td><td className="text-right">{n}</td></tr>)}
            {!wk.length && <tr><td className="py-2 text-gray-500">No bookings yet. Connect the Cal.com webhook in Settings.</td></tr>}
          </tbody></table>
          <p className="mt-2 text-sm text-gray-600">Attended {att}, no-show {ns}{att + ns ? `, show rate ${Math.round((att / (att + ns)) * 100)}%` : ""}. Mark outcomes on each contact.</p>
        </div>
      </div>
    </div>
  );
}
