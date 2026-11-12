import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace";
import { analyse, loadEngagement, pct, STATE_LABEL, type State } from "@/lib/engagement";

const order: State[] = ["reply_waiting", "clicked", "opened", "unseen", "replied", "booked", "cold", "bounced", "new"];

export default async function Analytics({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { ws } = await requireWorkspace();
  const days = Math.min(90, Math.max(1, Number((await searchParams).days) || 30));
  const { msgs, events, contacts } = await loadEngagement(ws.id, days);
  const a = analyse(msgs, events, contacts);
  const hot = a.rows.filter((r) => r.score > 0).sort((x, y) => y.score - x.score).slice(0, 15);
  const name = (c: { first_name: string | null; last_name: string | null; email: string | null }) => [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "Unknown";
  const funnel = (title: string, f: typeof a.email, opened: string) => (
    <div key={title} className="rounded border p-3">
      <div className="mb-2 font-semibold">{title}</div>
      <table className="w-full text-sm"><tbody>
        {[["Sent", f.sent, ""], ["Delivered", f.delivered, pct(f.delivered, f.sent)], [opened, f.opened, pct(f.opened, f.sent)], ["Clicked", f.clicked, pct(f.clicked, f.sent)], ["Replied (within 7 days)", f.replied, pct(f.replied, f.sent)], ["Failed", f.failed, ""]].map(([l, n, p]) => (
          <tr key={String(l)} className="border-b last:border-0"><td className="py-1">{l}</td><td className="text-right">{n}</td><td className="w-14 text-right text-gray-500">{p}</td></tr>
        ))}
      </tbody></table>
    </div>
  );
  return (
    <div className="max-w-5xl">
      <div className="mb-4 flex items-end justify-between">
        <div><h1 className="text-2xl font-semibold">Analytics</h1><p className="text-sm text-gray-500">{ws.name}, last {days} days</p></div>
        <div className="flex gap-2 text-sm">{[7, 30, 90].map((d) => <Link key={d} href={`/analytics?days=${d}`} className={`rounded border px-2 py-1 ${d === days ? "bg-black text-white" : ""}`}>{d}d</Link>)}</div>
      </div>
      <div className="mb-6 grid gap-3 md:grid-cols-3">
        {funnel("Email", a.email, "Opened (indicative)")}
        {funnel("WhatsApp", a.whatsapp, "Read")}
        {funnel("SMS", a.sms, "Opened")}
      </div>
      <p className="mb-6 text-xs text-gray-500">Email opens are indicative: Apple Mail and some gateways pre-load images, so we exclude opens within seconds of sending, but clicks and replies are the reliable signals.</p>

      <h2 className="mb-2 font-semibold">Where contacts are now</h2>
      <div className="mb-6 flex flex-wrap gap-2">
        {order.filter((s) => a.states.get(s)).map((s) => <div key={s} className="rounded border px-3 py-2 text-sm"><div className="text-xl font-semibold">{a.states.get(s)}</div>{STATE_LABEL[s]}</div>)}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="mb-2 font-semibold">Hot leads</h2>
          <table className="w-full text-left text-sm"><thead className="border-b text-gray-500"><tr><th className="py-1">Contact</th><th>Status</th><th>Score</th></tr></thead><tbody>
            {hot.map((r) => <tr key={r.contact.id} className="border-b"><td className="py-1"><Link className="underline" href={`/contacts/${r.contact.id}`}>{name(r.contact)}</Link></td><td>{STATE_LABEL[r.state]}</td><td>{r.score}</td></tr>)}
            {!hot.length && <tr><td className="py-2 text-gray-500" colSpan={3}>No engagement yet.</td></tr>}
          </tbody></table>
        </div>
        <div>
          <h2 className="mb-2 font-semibold">Subject lines</h2>
          <table className="w-full text-left text-sm"><thead className="border-b text-gray-500"><tr><th className="py-1">Subject</th><th>Sent</th><th>Opened</th><th>Clicked</th></tr></thead><tbody>
            {a.subjects.map((s) => <tr key={s.subject} className="border-b"><td className="py-1">{s.subject}</td><td>{s.sent}</td><td>{s.opened}</td><td>{s.clicked}</td></tr>)}
            {!a.subjects.length && <tr><td className="py-2 text-gray-500" colSpan={4}>No emails sent yet.</td></tr>}
          </tbody></table>
        </div>
      </div>
    </div>
  );
}
