import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { analyse, loadEngagement, PLAYBOOK, STATE_LABEL } from "@/lib/engagement";
import { agentAvailable } from "@/lib/agent";
import { approveDraft, askAgentToDraft, createDraft, editDraft, rejectDraft, setAgentMode } from "../../actions";

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
    <div className="max-w-4xl">
      <h1 className="mb-1 text-2xl font-semibold">Communications agent</h1>
      <div className={`mb-4 rounded border p-3 text-sm ${live ? "border-green-300 bg-green-50" : "border-amber-300 bg-amber-50"}`}>
        {live ? "AI key detected." : "AI drafting is paused: no Anthropic API key is set, so nothing is generated automatically and no AI cost is incurred."} Tracking, analytics, the playbook below and manual drafts all work now.
        <form action={setAgentMode} className="mt-2 flex items-center gap-2">
          <span>Mode:</span>
          <select name="mode" defaultValue={ws.agent_mode} className="rounded border p-1">
            <option value="off">Off</option>
            <option value="approval">Draft for my approval</option>
            <option value="auto">Auto-send follow-ups (replies still need approval)</option>
          </select>
          <button className="rounded border px-2 py-1">Save</button>
        </form>
      </div>

      <h2 className="mb-2 font-semibold">Approval queue ({pending.length})</h2>
      {pending.map((d) => (
        <div key={d.id} className="mb-3 rounded border p-3 text-sm">
          <div className="mb-1 flex justify-between"><span><b>{nm(d.contacts)}</b> via {d.channel} <span className="rounded bg-gray-100 px-1.5 text-xs">{d.source === "ai" ? "AI draft" : "manual"}</span></span><span className="text-gray-500">{d.state ? STATE_LABEL[d.state as keyof typeof STATE_LABEL] : ""}</span></div>
          {d.hypothesis && <p className="mb-1 text-gray-600"><b>Why:</b> {d.hypothesis} <b>Tactic:</b> {d.tactic}</p>}
          <form action={editDraft} className="flex flex-col gap-2">
            <input type="hidden" name="id" value={d.id} />
            {d.channel === "email" && <input name="subject" defaultValue={d.subject ?? ""} className="rounded border p-2" />}
            <textarea name="body" rows={6} defaultValue={d.body} className="rounded border p-2" />
            <div className="flex gap-2">
              <button className="rounded border px-3 py-1.5">Save edits</button>
              <button formAction={approveDraft} className="rounded bg-black px-3 py-1.5 text-white">Approve and send</button>
              <button formAction={rejectDraft} className="rounded border px-3 py-1.5 text-red-700">Reject</button>
            </div>
          </form>
        </div>
      ))}
      {!pending.length && <p className="mb-4 text-sm text-gray-500">Nothing waiting.</p>}

      <h2 className="mb-2 mt-6 font-semibold">Who needs a nudge</h2>
      <p className="mb-2 text-sm text-gray-500">Ranked by engagement. The playbook explains the likely reason and the next move; write your own draft or, once the key is added, ask the agent.</p>
      {need.map((r) => (
        <details key={r.contact.id} className="mb-2 rounded border p-3 text-sm">
          <summary className="cursor-pointer"><b>{nm(r.contact)}</b> <span className="text-gray-500">{STATE_LABEL[r.state]}, {r.sent} sent, {r.opens} opens, {r.clicks} clicks, score {r.score}</span></summary>
          <p className="mt-2"><b>Likely reason:</b> {PLAYBOOK[r.state].why}</p>
          <p className="mb-2"><b>Next move:</b> {PLAYBOOK[r.state].do}</p>
          <form action={createDraft} className="flex flex-col gap-2">
            <input type="hidden" name="contact_id" value={r.contact.id} /><input type="hidden" name="state" value={r.state} /><input type="hidden" name="tactic" value={PLAYBOOK[r.state].do} />
            <select name="channel" className="w-40 rounded border p-1"><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option></select>
            <input name="subject" placeholder="Subject (email)" className="rounded border p-2" />
            <textarea name="body" rows={4} placeholder="Draft message" required className="rounded border p-2" />
            <div className="flex gap-2"><button className="rounded border px-3 py-1.5">Add to queue</button>
              {live && <button formAction={askAgentToDraft} formNoValidate className="rounded border px-3 py-1.5">Ask agent to draft</button>}
              <Link href={`/contacts/${r.contact.id}`} className="px-2 py-1.5 underline">Open contact</Link></div>
          </form>
        </details>
      ))}
      {!need.length && <p className="text-sm text-gray-500">Everyone is up to date.</p>}

      {done.length > 0 && <><h2 className="mb-2 mt-6 font-semibold">Recent decisions</h2>
        {done.map((d) => <div key={d.id} className="border-b py-1 text-sm text-gray-600">{nm(d.contacts)} via {d.channel}: {d.status}{d.error ? ` (${d.error})` : ""}</div>)}</>}
    </div>
  );
}
