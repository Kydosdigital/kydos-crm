import Link from "next/link";
import { requireStaff } from "@/lib/workspace";
import { Flame, Info } from "lucide-react";
import { Avatar, Badge, CardTitle, ChannelIcon, Page, PageHeader, Segmented, Section, TableCard } from "@/components/ui";
import { analyse, loadEngagement, pct, STATE_LABEL, type State } from "@/lib/engagement";

const order: State[] = ["reply_waiting", "clicked", "opened", "unseen", "replied", "booked", "cold", "bounced", "new"];

export default async function Analytics({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { ws } = await requireStaff();
  const days = Math.min(90, Math.max(1, Number((await searchParams).days) || 30));
  const { msgs, events, contacts } = await loadEngagement(ws.id, days);
  const a = analyse(msgs, events, contacts);
  const hot = a.rows.filter((r) => r.score > 0).sort((x, y) => y.score - x.score).slice(0, 15);
  const name = (c: { first_name: string | null; last_name: string | null; email: string | null }) => [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "Unknown";
  const funnel = (title: string, f: typeof a.email, opened: string, channel: string) => (
    <div key={title} className="card p-5">
      <div className="mb-4 flex items-center justify-between"><ChannelIcon channel={channel} label /><span className="text-xs text-muted">{f.sent} sent</span></div>
      <table className="w-full text-[13px]"><tbody>
        {[["Sent", f.sent, ""], ["Delivered", f.delivered, pct(f.delivered, f.sent)], [opened, f.opened, pct(f.opened, f.sent)], ["Clicked", f.clicked, pct(f.clicked, f.sent)], ["Replied (within 7 days)", f.replied, pct(f.replied, f.sent)], ["Failed", f.failed, ""]].map(([l, n, p]) => (
          <tr key={String(l)}>
            <td className="py-1.5">
              <div className="flex items-baseline justify-between gap-2"><span className={l === "Failed" && Number(n) > 0 ? "text-danger-ink" : "text-ink-2"}>{l}</span><span className="tabular"><span className="font-semibold text-ink">{n}</span><span className="ml-2 inline-block w-9 text-right text-xs text-muted">{p}</span></span></div>
              <div className="meter mt-1.5 !h-1"><span className={l === "Failed" ? "!bg-danger" : ""} style={{ width: `${f.sent ? Math.min(100, (Number(n) / f.sent) * 100) : 0}%` }} /></div>
            </td>
          </tr>
        ))}
      </tbody></table>
    </div>
  );
  const TONE: Partial<Record<State, "brand" | "violet" | "warning" | "danger" | "success" | "info">> = { reply_waiting: "brand", clicked: "violet", opened: "violet", replied: "success", booked: "success", cold: "info", bounced: "danger", unseen: "warning" };
  return (
    <Page>
      <PageHeader
        title="Analytics"
        description={<>{ws.name}, last {days} days</>}
        actions={<Segmented label="Date range" items={[7, 30, 90].map((d) => ({ href: `/analytics?days=${d}`, label: `${d}d`, active: d === days }))} />}
      />
      <div className="mb-3 grid gap-4 md:grid-cols-3">
        {funnel("Email", a.email, "Opened (indicative)", "email")}
        {funnel("WhatsApp", a.whatsapp, "Read", "whatsapp")}
        {funnel("SMS", a.sms, "Opened", "sms")}
      </div>
      <p className="mb-8 flex items-start gap-1.5 text-xs leading-relaxed text-muted"><Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />Email opens are indicative: Apple Mail and some gateways pre-load images, so we exclude opens within seconds of sending, but clicks and replies are the reliable signals.</p>

      <Section title="Where contacts are now" className="mb-8">
        <div className="flex flex-wrap gap-3">
          {order.filter((s) => a.states.get(s)).map((s) => <div key={s} className="card min-w-36 px-4 py-3"><div className="tabular text-2xl font-semibold leading-none tracking-tight text-ink">{a.states.get(s)}</div><div className="mt-2"><Badge tone={TONE[s] ?? "neutral"} dot>{STATE_LABEL[s]}</Badge></div></div>)}
          {!order.some((s) => a.states.get(s)) && <p className="text-[13px] text-muted">No contacts messaged in this period.</p>}
        </div>
      </Section>

      <div className="grid items-start gap-6 md:grid-cols-2">
        <TableCard>
          <div className="px-5 pb-1 pt-4"><CardTitle icon={Flame}>Hot leads</CardTitle></div>
          <table className="table table-compact"><thead><tr><th>Contact</th><th>Status</th><th className="num">Score</th></tr></thead><tbody>
            {hot.map((r) => <tr key={r.contact.id}><td><Link className="link-quiet flex items-center gap-2.5" href={`/contacts/${r.contact.id}`}><Avatar name={name(r.contact)} size="sm" />{name(r.contact)}</Link></td><td><Badge tone={TONE[r.state] ?? "neutral"} dot>{STATE_LABEL[r.state]}</Badge></td><td className="num font-semibold text-ink">{r.score}</td></tr>)}
            {!hot.length && <tr><td className="!py-8 text-center text-muted" colSpan={3}>No engagement yet.</td></tr>}
          </tbody></table>
        </TableCard>
        <TableCard>
          <div className="px-5 pb-1 pt-4"><CardTitle>Subject lines</CardTitle></div>
          <table className="table table-compact"><thead><tr><th>Subject</th><th className="num">Sent</th><th className="num">Opened</th><th className="num">Clicked</th></tr></thead><tbody>
            {a.subjects.map((s) => <tr key={s.subject}><td className="text-ink">{s.subject}</td><td className="num">{s.sent}</td><td className="num">{s.opened}</td><td className="num">{s.clicked}</td></tr>)}
            {!a.subjects.length && <tr><td className="!py-8 text-center text-muted" colSpan={4}>No emails sent yet.</td></tr>}
          </tbody></table>
        </TableCard>
      </div>
    </Page>
  );
}
