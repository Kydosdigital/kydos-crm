import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { PoundSterling, CalendarCheck, Clock, Trophy, UserPlus, UserX } from "lucide-react";
import { Badge, Card, CardTitle, Meter, Page, PageHeader, Segmented, Stat, TableCard } from "@/components/ui";

const ago = (d: number) => new Date(Date.now() - d * 864e5).toISOString();
const gbp = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;
const median = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);
const mins = (m: number | null) => (m === null ? "n/a" : m < 60 ? `${Math.round(m)} min` : m < 1440 ? `${(m / 60).toFixed(1)} h` : `${(m / 1440).toFixed(1)} days`);
const Bar = ({ v, max }: { v: number; max: number }) => <Meter value={v} max={max} />;

export default async function Reports({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { ws } = await requireWorkspace();
  const days = Math.min(365, Math.max(7, Number((await searchParams).days) || 30));
  const db = await supabaseServer();
  const since = ago(days);
  const [{ data: contacts }, { data: opps }, { data: stages }, { data: bookings }, { data: firstOut }, { data: allContacts }, { data: paidInv }] = await Promise.all([
    db.from("contacts").select("id,source,tags,created_at").eq("workspace_id", ws.id).gte("created_at", since).limit(10000),
    db.from("opportunities").select("id,value,status,stage_id,created_at,closed_at,contact_id").eq("workspace_id", ws.id).limit(10000),
    db.from("stages").select("id,name,position").eq("workspace_id", ws.id).order("position"),
    db.from("bookings").select("id,contact_id,status,start_time,created_at").eq("workspace_id", ws.id).gte("created_at", ago(90)).limit(10000),
    db.from("messages").select("contact_id,created_at").eq("workspace_id", ws.id).eq("direction", "out").neq("status", "failed").gte("created_at", since).order("created_at").limit(20000),
    db.from("contacts").select("id,source,utm_source,utm_medium,fbclid,gclid").eq("workspace_id", ws.id).limit(20000),
    db.from("invoices").select("contact_id,amount_gbp").eq("workspace_id", ws.id).eq("kind", "invoice").eq("status", "paid").gte("paid_at", since).limit(10000),
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

  // Revenue by source (won deals closed and invoices paid in the period, credited to the contact's first-touch source)
  const label = (c: { source: string | null; utm_source: string | null; utm_medium: string | null; fbclid: string | null; gclid: string | null }) =>
    c.utm_source ? `${c.utm_source}${c.utm_medium ? " / " + c.utm_medium : ""}` : c.fbclid ? "facebook / paid" : c.gclid ? "google / paid" : c.source ?? "unknown";
  const byId = new Map((allContacts ?? []).map((c) => [c.id, label(c)]));
  const rev = new Map<string, { deals: number; won: number; paid: number }>();
  const bump = (cid: string) => { const k = byId.get(cid) ?? "unknown"; const r = rev.get(k) ?? { deals: 0, won: 0, paid: 0 }; rev.set(k, r); return r; };
  for (const o of opps ?? []) if (o.status === "won" && (o.closed_at ?? o.created_at) >= since) { const r = bump(o.contact_id); r.deals++; r.won += Number(o.value); }
  for (const i of paidInv ?? []) bump(i.contact_id).paid += Number(i.amount_gbp);
  const revenue = [...rev.entries()].map(([k, v]) => ({ k, ...v, total: v.won + v.paid })).filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
  const maxRev = Math.max(1, ...revenue.map((r) => r.total));

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

  const kpis = [["New leads", String((contacts ?? []).length), UserPlus], ["Median time to first message", mins(median(waits)), Clock], ["Never contacted", String(never), UserX], ["Win rate", winRate === null ? "n/a" : `${winRate}%`, Trophy]] as const;

  return (
    <Page>
      <PageHeader
        title="Reports"
        description={<>{ws.name}. Leads and replies for the last {days} days. See Analytics for email and WhatsApp engagement.</>}
        actions={<Segmented label="Date range" items={[30, 90, 365].map((d) => ({ href: `/reports?days=${d}`, label: `${d}d`, active: d === days }))} />}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {kpis.map(([l, v, icon]) => <Stat key={l} label={l} value={v} icon={icon} tone={l === "Never contacted" && never > 0 ? "warning" : "brand"} />)}
      </div>

      <TableCard className="mb-6">
        <div className="px-5 pb-1 pt-4"><CardTitle>Lead sources</CardTitle></div>
        <table className="table"><thead><tr><th>Source</th><th className="w-2/5">Leads</th><th>Booked</th><th className="num">Won</th></tr></thead><tbody>
          {sources.map(([k, v]) => <tr key={k}><td className="font-medium text-ink">{k}</td><td><div className="flex items-center gap-3"><Bar v={v.leads} max={maxLeads} /><span className="tabular w-8 shrink-0 text-right font-medium text-ink">{v.leads}</span></div></td><td className="tabular">{v.booked} <span className="text-muted">({v.leads ? Math.round((v.booked / v.leads) * 100) : 0}%)</span></td><td className="num">{v.won}</td></tr>)}
          {!sources.length && <tr><td colSpan={4} className="!py-8 text-center text-muted">No leads in this period.</td></tr>}
        </tbody></table>
      </TableCard>

      <TableCard className="mb-6">
        <div className="px-5 pb-1 pt-4"><CardTitle icon={PoundSterling}>Revenue by source</CardTitle></div>
        <table className="table"><thead><tr><th>Source</th><th className="w-2/5">Revenue</th><th>Won deals</th><th className="num">Paid invoices</th></tr></thead><tbody>
          {revenue.map((r) => <tr key={r.k}><td className="font-medium text-ink">{r.k}</td><td><div className="flex items-center gap-3"><Bar v={r.total} max={maxRev} /><span className="tabular w-20 shrink-0 text-right font-medium text-ink">{gbp(r.total)}</span></div></td><td className="tabular">{r.deals} <span className="text-muted">({gbp(r.won)})</span></td><td className="num">{gbp(r.paid)}</td></tr>)}
          {!revenue.length && <tr><td colSpan={4} className="!py-8 text-center text-muted">No won deals or paid invoices in this period. Add UTM tags to your ad links to see which campaign earned what.</td></tr>}
        </tbody></table>
      </TableCard>

      <div className="grid items-start gap-6 md:grid-cols-2">
        <Card>
          <CardTitle aside={<Badge tone="outline">{open.length} open</Badge>}>Open pipeline by stage</CardTitle>
          <table className="w-full text-left text-[13px]"><tbody>
            {stageRows.map((s) => <tr key={s.name} className="border-b border-line"><td className="py-2 pr-3 text-ink-2">{s.name}</td><td className="w-1/3"><Bar v={s.v} max={maxStage} /></td><td className="tabular px-3 text-right text-muted">{s.n}</td><td className="tabular text-right font-medium text-ink">{gbp(s.v)}</td></tr>)}
            <tr className="font-semibold text-ink"><td className="pt-2.5" colSpan={2}>Total open</td><td className="tabular px-3 pt-2.5 text-right">{open.length}</td><td className="tabular pt-2.5 text-right">{gbp(open.reduce((t, o) => t + Number(o.value), 0))}</td></tr>
          </tbody></table>
        </Card>
        <Card>
          <CardTitle>Won revenue by month</CardTitle>
          <table className="w-full text-left text-[13px]"><tbody>
            {months.map(([m, v]) => <tr key={m} className="border-b border-line last:border-0"><td className="tabular py-2 pr-3 text-ink-2">{m}</td><td className="w-1/2"><Bar v={v} max={maxMonth} /></td><td className="tabular pl-3 text-right font-medium text-ink">{gbp(v)}</td></tr>)}
            {!months.length && <tr><td className="py-4 text-muted">No won deals yet. Move an opportunity to Won to see revenue.</td></tr>}
          </tbody></table>
        </Card>
        <Card>
          <CardTitle icon={CalendarCheck}>Bookings per week (week starting)</CardTitle>
          <table className="w-full text-left text-[13px]"><tbody>
            {wk.map(([w, n]) => <tr key={w} className="border-b border-line last:border-0"><td className="tabular py-2 pr-3 text-ink-2">{w}</td><td className="w-1/2"><Bar v={n} max={maxWk} /></td><td className="tabular pl-3 text-right font-medium text-ink">{n}</td></tr>)}
            {!wk.length && <tr><td className="py-4 text-muted">No bookings yet. Connect the Cal.com webhook in Settings.</td></tr>}
          </tbody></table>
          <p className="mt-3 border-t border-line pt-3 text-[13px] text-muted">Attended {att}, no-show {ns}{att + ns ? `, show rate ${Math.round((att / (att + ns)) * 100)}%` : ""}. Mark outcomes on each contact.</p>
        </Card>
      </div>
    </Page>
  );
}
