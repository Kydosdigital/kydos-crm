import Link from "next/link";
import { requireStaff } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { Download, PhoneCall, PhoneIncoming, PhoneOutgoing, ScrollText } from "lucide-react";
import { EmptyState, Page, PageHeader, Section, StatusBadge, TableCard } from "@/components/ui";

export default async function Activity() {
  const { ws } = await requireStaff();
  const db = await supabaseServer();
  const [{ data: log }, { data: calls }] = await Promise.all([
    db.from("activity_log").select("*").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(100),
    db.from("call_logs").select("*, contacts(id,first_name,last_name)").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(30),
  ]);
  const t = (d: string) => new Date(d).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "short", timeStyle: "short" });
  return (
    <Page>
      <PageHeader
        title="Activity and calls"
        description="Who changed what, plus every call. A copy is also saved automatically every night and the last 14 are kept."
        actions={<a href="/api/backup" className="btn btn-secondary"><Download aria-hidden />Download a full backup (JSON)</a>}
      />
      <Section title="Calls" className="mb-10">
        <TableCard>
          <table className="table table-compact"><thead><tr><th>When</th><th>Direction</th><th>Contact</th><th>Outcome</th></tr></thead><tbody>
            {(calls ?? []).map((k) => { const c = k.contacts as { id: string; first_name: string | null; last_name: string | null } | null; return (
              <tr key={k.id}><td className="tabular whitespace-nowrap text-muted">{t(k.created_at)}</td><td><span className="inline-flex items-center gap-1.5">{k.direction === "in" ? <PhoneIncoming className="h-3.5 w-3.5 text-info-ink" aria-hidden /> : <PhoneOutgoing className="h-3.5 w-3.5 text-faint" aria-hidden />}{k.direction === "in" ? "Incoming" : "Outgoing"}</span></td><td>{c ? <Link className="link-quiet" href={`/contacts/${c.id}`}>{[c.first_name, c.last_name].filter(Boolean).join(" ") || k.from_number}</Link> : (k.from_number ?? k.to_number)}</td><td><StatusBadge status={k.status} label={k.status} />{k.duration_seconds ? <span className="tabular ml-2 text-xs text-muted">{k.duration_seconds}s</span> : ""}</td></tr>); })}
          </tbody></table>
          {(calls ?? []).length === 0 && <EmptyState icon={PhoneCall} title="No calls yet." className="!py-9">Set your Twilio call number in Settings.</EmptyState>}
        </TableCard>
      </Section>
      <Section title="Activity log">
        <TableCard>
          <table className="table table-compact"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th></tr></thead><tbody>
            {(log ?? []).map((a) => <tr key={a.id}><td className="tabular whitespace-nowrap text-muted">{t(a.created_at)}</td><td className="font-medium text-ink">{a.actor}</td><td>{a.action}</td><td className="max-w-md truncate text-muted">{a.detail}</td></tr>)}
          </tbody></table>
          {(log ?? []).length === 0 && <EmptyState icon={ScrollText} title="No activity yet" className="!py-9">Changes made by you, your team and automations are recorded here.</EmptyState>}
        </TableCard>
      </Section>
    </Page>
  );
}
