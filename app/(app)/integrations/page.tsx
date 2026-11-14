import Link from "next/link";
import { requireAdmin } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { inspect } from "@/lib/integrations";
import { syncFacebookNow } from "../../actions";
import { Bot, CalendarCheck, CreditCard, Mail, MessageCircle, MessagesSquare, PhoneCall, Plug, RefreshCw, Send, Sparkles, Radio, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Alert, Badge, ChannelIcon, EmptyState, Page, PageHeader, Section, Segmented, TableCard, channelLabel } from "@/components/ui";

export const dynamic = "force-dynamic";
const BADGE = { connected: "success", needs_setup: "neutral", error: "danger" } as const;
const ICON: Record<string, typeof Plug> = { email: Send, facebook: MessagesSquare, whatsapp: MessageCircle, twilio: PhoneCall, stripe: CreditCard, calcom: CalendarCheck, outlook: Mail, ai: Sparkles, mcp: Bot };
const LABEL = { connected: "Connected", needs_setup: "Needs setup", error: "Problem" } as const;
const when = (d: string | null) => (d ? new Date(d).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "short", timeStyle: "short" }) : "No activity yet");

export default async function Integrations({ searchParams }: { searchParams: Promise<{ channel?: string; synced?: string; error?: string }> }) {
  const { channel, synced, error } = await searchParams;
  const { ws } = await requireAdmin();
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
  const live = items.filter((i) => i.status === "connected").length, broken = items.filter((i) => i.status === "error").length;
  return (
    <Page>
      <PageHeader
        title="Integrations and interactions"
        description={`Every connected service with a live health check, and every interaction across all channels in one feed. Checks ran at ${new Date().toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" })}.`}
        actions={<div className="flex flex-wrap gap-2"><Link href="/integrations/pipedream" className="btn btn-secondary"><Plug aria-hidden /> Pipedream Connect</Link><Link href={`/integrations?r=${new Date().getTime()}${channel ? `&channel=${channel}` : ""}`} className="btn btn-secondary"><RefreshCw aria-hidden />Re-run checks</Link></div>}
        meta={<><Badge tone={live ? "success" : "neutral"} dot>{live} connected</Badge>{broken > 0 && <Badge tone="danger" dot>{broken} with a problem</Badge>}</>}
      />
      {synced && <Alert tone="success">Facebook and Instagram sync finished: {synced} new message(s) imported.</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="mb-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((i) => { const Icon = ICON[i.key] ?? Plug; return (
          <div key={i.key} className={`card flex flex-col p-5 ${i.status === "error" ? "!border-danger/40" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] ${i.status === "connected" ? "bg-brand-soft text-brand-soft-ink" : i.status === "error" ? "bg-danger-bg text-danger-ink" : "bg-subtle text-muted"}`}><Icon className="h-5 w-5" aria-hidden /></span>
              <Badge tone={BADGE[i.status]} dot>{LABEL[i.status]}</Badge>
            </div>
            <b className="mt-3 text-sm font-semibold text-ink">{i.name}</b>
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{i.what}</p>
            {i.detail && <p className="mt-2 break-words text-xs text-ink-2">{i.detail}</p>}
            {i.status !== "connected" && <p className="mt-2 rounded-lg bg-warning-bg px-3 py-2 text-xs leading-relaxed text-warning-ink">{i.setup}</p>}
            <div className="mt-auto flex items-center justify-between gap-2 pt-4">
              <p className="flex items-center gap-1.5 text-xs text-muted"><Radio className="h-3.5 w-3.5" aria-hidden />Last activity: {when(i.last)}</p>
              {i.syncable && <form action={syncFacebookNow}><button className="btn btn-secondary btn-sm"><RefreshCw aria-hidden />Sync Facebook and Instagram now</button></form>}
            </div>
          </div>
        ); })}
      </div>
      <Section title="All interactions" description="The 60 most recent messages and calls." actions={
        <Segmented label="Channel" items={[{ href: "/integrations", label: "All", active: !channel }, ...chans.map((c) => ({ href: `/integrations?channel=${c}`, label: channelLabel(c), active: channel === c }))]} />
      }>
        <TableCard>
          <table className="table"><thead><tr><th>When</th><th>Channel</th><th>Contact</th><th>Message</th><th>Status</th></tr></thead><tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="tabular whitespace-nowrap text-xs text-muted">{when(r.at)}</td>
                <td className="whitespace-nowrap"><span className="flex items-center gap-2"><ChannelIcon channel={r.channel} label /><span className="inline-flex items-center gap-0.5 text-xs text-faint">{r.dir === "in" ? <ArrowDownLeft className="h-3 w-3" aria-hidden /> : <ArrowUpRight className="h-3 w-3" aria-hidden />}{r.dir === "in" ? "received" : "sent"}</span></span></td>
                <td className="whitespace-nowrap">{r.contactId ? <Link href={`/contacts/${r.contactId}`} className="link-quiet">{r.who}</Link> : r.who}</td>
                <td className="max-w-md truncate text-muted">{r.text.slice(0, 140)}</td>
                <td className="whitespace-nowrap text-xs text-muted">{r.status}</td>
              </tr>
            ))}
          </tbody></table>
          {rows.length === 0 && <EmptyState icon={MessagesSquare} title="Nothing here yet.">Messages and calls will appear as soon as a channel is active.</EmptyState>}
        </TableCard>
      </Section>
    </Page>
  );
}
