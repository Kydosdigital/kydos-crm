import Link from "next/link";
import { requireStaff } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { createProposal, sendProposal, deleteProposal } from "../../actions";
import { ExternalLink, FileSignature, Plus, Send } from "lucide-react";
import { Alert, EmptyState, Field, Page, PageHeader, StatusBadge, TableCard, humanise } from "@/components/ui";
import { Modal } from "@/components/ui/modal";

export default async function Proposals({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { ws } = await requireStaff();
  const db = await supabaseServer();
  const app = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const [{ data: props }, { data: contacts }] = await Promise.all([
    db.from("proposals").select("*, contacts(id,first_name,last_name,email)").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(100),
    db.from("contacts").select("id,first_name,last_name,email,company").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(500),
  ]);
  return (
    <Page>
      <PageHeader
        title="Proposals"
        description={<>Write a proposal, email the client a private link, and they can read it and click Accept with their typed name. You are alerted when it is opened, accepted or declined, and the contact is tagged <code>proposal-accepted</code>.</>}
        actions={
          <Modal wide trigger={<><Plus aria-hidden />New proposal</>} title="New proposal" description="Saved as a draft until you email it to the client.">
            <form action={createProposal} className="flex flex-col gap-3">
              <Field label="Contact"><select name="contact_id" required className="select"><option value="">Choose contact</option>{(contacts ?? []).map((c) => <option key={c.id} value={c.id}>{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email}{c.company ? ` (${c.company})` : ""}</option>)}</select></Field>
              <div className="flex gap-3"><Field label="Title" className="flex-1"><input name="title" required placeholder="Title, e.g. Social media management proposal" className="input" /></Field><Field label="Total (£)" className="w-44"><input name="amount" type="number" step="0.01" placeholder="Total (£, optional)" className="input" /></Field></div>
              <Field label="Proposal" hint={<>Formatting: blank line for a new paragraph, <code>## Heading</code>, <code>- bullet</code>, <code>**bold**</code> and <code>[button: Label | https://...]</code>.</>}>
                <textarea name="body" rows={12} required placeholder={"Write the proposal. Blank line = new paragraph.\n## Heading\n- bullet points\n**bold**\n[button: See our work | https://...]"} className="textarea" />
              </Field>
              <button className="btn btn-primary self-start">Save proposal</button>
            </form>
          </Modal>
        }
      />
      {error && <Alert tone="warning">{error}</Alert>}
      <TableCard>
        <table className="table"><thead><tr><th>Title</th><th>Client</th><th className="num">Amount</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
          {(props ?? []).map((p) => { const c = p.contacts as { id: string; first_name: string | null; last_name: string | null; email: string | null } | null; return (
            <tr key={p.id}><td className="font-semibold text-ink">{p.title}</td>
              <td className="whitespace-nowrap">{c ? <Link className="link-quiet" href={`/contacts/${c.id}`}>{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email}</Link> : ""}</td>
              <td className="num font-semibold text-ink">{p.amount_gbp != null ? `£${Number(p.amount_gbp).toLocaleString("en-GB")}` : ""}</td>
              <td className="whitespace-nowrap"><StatusBadge status={p.status} label={<>{humanise(p.status)}{p.status === "accepted" ? ` by ${p.signed_name}` : ""}</>} /></td>
              <td><div className="flex items-center justify-end gap-1">
                {p.status !== "accepted" && p.status !== "declined" && <form action={sendProposal}><input type="hidden" name="id" value={p.id} /><button className="btn btn-ghost btn-sm"><Send aria-hidden />{p.status === "draft" ? "Email to client" : "Resend"}</button></form>}
                <a href={`${app}/f/proposal/${p.token}`} target="_blank" className="btn btn-ghost btn-sm">{p.status === "draft" ? "Preview after sending" : "Open"}<ExternalLink aria-hidden /></a>
                <form action={deleteProposal}><input type="hidden" name="id" value={p.id} /><button className="btn btn-danger btn-sm">Delete</button></form>
              </div></td></tr>); })}
        </tbody></table>
        {(props ?? []).length === 0 && <EmptyState icon={FileSignature} title="No proposals yet">Write your first proposal with the New proposal button. Clients accept online with their typed name.</EmptyState>}
      </TableCard>
    </Page>
  );
}
