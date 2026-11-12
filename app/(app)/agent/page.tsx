import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { analyse, loadEngagement, PLAYBOOK, STATE_LABEL } from "@/lib/engagement";
import { agentAvailable } from "@/lib/agent";
import { approveDraft, askAgentToDraft, createDraft, editDraft, rejectDraft, setAgentMode } from "../../actions";
import { Check, CircleCheck, Lightbulb, PauseCircle, Sparkles, Target } from "lucide-react";
import { Avatar, Badge, ChannelIcon, EmptyState, Page, PageHeader, Section, StatusBadge } from "@/components/ui";

export default async function Agent() {
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const { data: drafts } = await db.from("agent_drafts").select("*, contacts(first_name,last_name,email,phone)").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(40);
  const { msgs, events, contacts } = await loadEngagement(ws.id, 60);
  const need = analyse(msgs, events, contacts).rows
    .filter((r) => ["reply_waiting", "clicked", "opened", "unseen", "cold"].includes(r.state))
    .sort((a, b) => (a.state === "reply_waiting" ? -1 : b.state === "reply_waiting" ? 1 : b.score - a.score))
    .slice(0, 25);
  const pending = (drafts ?? []).filter((d) => d.status === "pending");
  const done = (drafts ?? []).filter((d) => d.status !== "pending").slice(0, 10);
  const nm = (c: { first_name: string | null; last_name: string | null; email: string | null } | null) => (c ? [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email : "Unknown");
  const live = agentAvailable();

  return (
    <Page>
      <PageHeader title="Communications agent" description="Drafts follow-ups for your approval and shows who needs a nudge, based on how each contact has engaged." meta={live ? <Badge tone="success" dot>AI ready</Badge> : <Badge tone="warning" dot>AI paused</Badge>} />
      <div className={`card mb-8 flex flex-wrap items-center justify-between gap-4 p-5 ${live ? "!border-success-ink/25" : "!border-warning-ink/25"}`}>
        <div className="flex min-w-0 max-w-2xl items-start gap-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${live ? "bg-success-bg text-success-ink" : "bg-warning-bg text-warning-ink"}`}>{live ? <Sparkles className="h-4 w-4" aria-hidden /> : <PauseCircle className="h-4 w-4" aria-hidden />}</span>
          <p className="text-[13px] leading-relaxed text-ink-2">{live ? "AI key detected." : "AI drafting is paused: no Anthropic API key is set, so nothing is generated automatically and no AI cost is incurred."} Tracking, analytics, the playbook below and manual drafts all work now.</p>
        </div>
        <form action={setAgentMode} className="flex items-end gap-2">
          <label className="block"><span className="label">Mode:</span>
            <select name="mode" defaultValue={ws.agent_mode} className="select !w-80">
              <option value="off">Off</option>
              <option value="approval">Draft for my approval</option>
              <option value="auto">Auto-send follow-ups (replies still need approval)</option>
            </select></label>
          <button className="btn btn-secondary">Save</button>
        </form>
      </div>

      <Section title={<>Approval queue ({pending.length})</>} className="mb-10">
        <div className="flex flex-col gap-4">
          {pending.map((d) => (
            <div key={d.id} className="card p-5 text-[13px]">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-2.5"><Avatar name={String(nm(d.contacts))} /><b className="text-sm font-semibold text-ink">{nm(d.contacts)}</b><span className="flex items-center gap-1.5 text-muted">via <ChannelIcon channel={d.channel} label /></span> <Badge tone={d.source === "ai" ? "violet" : "neutral"}>{d.source === "ai" ? "AI draft" : "manual"}</Badge></span><span>{d.state ? <Badge tone="outline">{STATE_LABEL[d.state as keyof typeof STATE_LABEL]}</Badge> : ""}</span></div>
              {d.hypothesis && <p className="well mb-3 px-3.5 py-2.5 leading-relaxed text-ink-2"><b className="font-semibold text-ink">Why:</b> {d.hypothesis} <b className="font-semibold text-ink">Tactic:</b> {d.tactic}</p>}
              <form action={editDraft} className="flex flex-col gap-2.5">
                <input type="hidden" name="id" value={d.id} />
                {d.channel === "email" && <input name="subject" defaultValue={d.subject ?? ""} aria-label="Subject" className="input !font-medium" />}
                <textarea name="body" rows={6} defaultValue={d.body} aria-label="Message" className="textarea" />
                <div className="flex gap-2">
                  <button className="btn btn-secondary order-2">Save edits</button>
                  <button formAction={approveDraft} className="btn btn-primary order-1"><Check aria-hidden />Approve and send</button>
                  <button formAction={rejectDraft} className="btn btn-danger order-3 ml-auto">Reject</button>
                </div>
              </form>
            </div>
          ))}
        </div>
        {!pending.length && <div className="card"><EmptyState icon={CircleCheck} title="Nothing waiting." className="!py-9">Drafts that need your approval will appear here.</EmptyState></div>}
      </Section>

      <Section title="Who needs a nudge" description="Ranked by engagement. The playbook explains the likely reason and the next move; write your own draft or, once the key is added, ask the agent." className="mb-10">
        <div className="card divide-y divide-line">
          {need.map((r) => (
            <details key={r.contact.id} className="disclosure group px-5 py-3.5 text-[13px]">
              <summary><Avatar name={String(nm(r.contact))} size="sm" /><b className="font-semibold text-ink">{nm(r.contact)}</b> <Badge tone={r.state === "reply_waiting" ? "brand" : "neutral"} dot>{STATE_LABEL[r.state]}</Badge><span className="tabular ml-auto text-xs font-normal text-muted">{r.sent} sent, {r.opens} opens, {r.clicks} clicks, score {r.score}</span></summary>
              <div className="mt-4 grid gap-3 pl-6 sm:grid-cols-2">
                <p className="well flex gap-2.5 px-3.5 py-3 leading-relaxed text-ink-2"><Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-warning-ink" aria-hidden /><span><b className="font-semibold text-ink">Likely reason:</b> {PLAYBOOK[r.state].why}</span></p>
                <p className="well flex gap-2.5 px-3.5 py-3 leading-relaxed text-ink-2"><Target className="mt-0.5 h-4 w-4 shrink-0 text-brand-text" aria-hidden /><span><b className="font-semibold text-ink">Next move:</b> {PLAYBOOK[r.state].do}</span></p>
              </div>
              <form action={createDraft} className="mt-3 flex flex-col gap-2.5 pb-2 pl-6">
                <input type="hidden" name="contact_id" value={r.contact.id} /><input type="hidden" name="state" value={r.state} /><input type="hidden" name="tactic" value={PLAYBOOK[r.state].do} />
                <div className="flex gap-2">
                  <select name="channel" aria-label="Channel" className="select !w-40"><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option></select>
                  <input name="subject" placeholder="Subject (email)" aria-label="Subject (email)" className="input flex-1" />
                </div>
                <textarea name="body" rows={4} placeholder="Draft message" aria-label="Draft message" required className="textarea" />
                <div className="flex items-center gap-2"><button className="btn btn-secondary">Add to queue</button>
                  {live && <button formAction={askAgentToDraft} formNoValidate className="btn btn-secondary"><Sparkles aria-hidden />Ask agent to draft</button>}
                  <Link href={`/contacts/${r.contact.id}`} className="btn btn-ghost">Open contact</Link></div>
              </form>
            </details>
          ))}
          {!need.length && <EmptyState icon={CircleCheck} title="Everyone is up to date." className="!py-9" />}
        </div>
      </Section>

      {done.length > 0 && <Section title="Recent decisions">
        <div className="card divide-y divide-line">
          {done.map((d) => <div key={d.id} className="flex items-center gap-2.5 px-5 py-2.5 text-[13px] text-ink-2"><Avatar name={String(nm(d.contacts))} size="sm" /><span className="font-medium text-ink">{nm(d.contacts)}</span><span className="text-muted">via {d.channel}:</span><StatusBadge status={d.status} label={d.status} />{d.error ? <span className="truncate text-danger-ink">({d.error})</span> : ""}</div>)}
        </div></Section>}
    </Page>
  );
}
