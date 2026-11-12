import Link from "next/link";
import { requireStaff } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { createInvoice, sendInvoice, setInvoiceStatus } from "../../actions";
import { Banknote, CircleCheck, ExternalLink, Hourglass, Plus, Receipt } from "lucide-react";
import { Alert, Badge, EmptyState, Field, Page, PageHeader, Stat, StatusBadge, TableCard } from "@/components/ui";
import { Modal } from "@/components/ui/modal";

const gbp = (n: number) => `£${Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2 })}`;

export default async function Invoices({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { ws } = await requireStaff();
  const db = await supabaseServer();
  const [{ data: invs }, { data: contacts }] = await Promise.all([
    db.from("invoices").select("*, contacts(id,first_name,last_name,email)").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(100),
    db.from("contacts").select("id,first_name,last_name,email,company").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(500),
  ]);
  const total = (st: string) => (invs ?? []).filter((i) => i.kind === "invoice" && i.status === st).reduce((a, i) => a + Number(i.amount_gbp), 0);
  return (
    <Page>
      <PageHeader
        title="Invoices and estimates"
        description={<>Invoices get a Stripe payment link when STRIPE_SECRET_KEY is set; paying marks them paid, tags the contact <code>paid</code> and tells Meta.</>}
        actions={
          <Modal trigger={<><Plus aria-hidden />New invoice</>} title="New invoice or estimate">
            <form action={createInvoice} className="grid grid-cols-2 gap-3">
              <Field label="Contact" className="col-span-2"><select name="contact_id" required className="select"><option value="">Choose contact</option>{(contacts ?? []).map((c) => <option key={c.id} value={c.id}>{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email}{c.company ? ` (${c.company})` : ""}</option>)}</select></Field>
              <Field label="Description" className="col-span-2"><input name="description" required placeholder="What it is for, e.g. Monthly social media management" className="input" /></Field>
              <Field label="Amount (£)"><input name="amount" type="number" step="0.01" required placeholder="Amount (£)" className="input" /></Field>
              <Field label="Due date"><input name="due_date" type="date" className="input" /></Field>
              <Field label="Type"><select name="kind" className="select"><option value="invoice">Invoice</option><option value="estimate">Estimate</option></select></Field>
              <button className="btn btn-primary self-end">Create</button>
            </form>
          </Modal>
        }
      />
      {error && <Alert tone="warning">{error}</Alert>}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <Stat label="Outstanding" value={gbp(total("sent"))} icon={Hourglass} tone="warning" />
        <Stat label="Paid" value={gbp(total("paid"))} icon={CircleCheck} tone="brand" />
        <Stat label="Documents" value={(invs ?? []).length} icon={Receipt} />
      </div>
      <TableCard>
        <table className="table"><thead><tr><th>Number</th><th>Client</th><th>Description</th><th className="num">Amount</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
          {(invs ?? []).map((i) => { const c = i.contacts as { id: string; first_name: string | null; last_name: string | null; email: string | null } | null; return (
            <tr key={i.id}><td className="tabular whitespace-nowrap font-semibold text-ink">{i.number}{i.kind === "estimate" && <Badge tone="outline" className="ml-2">Estimate</Badge>}</td>
              <td className="whitespace-nowrap">{c ? <Link className="link-quiet" href={`/contacts/${c.id}`}>{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email}</Link> : ""}</td>
              <td className="max-w-xs truncate text-muted">{i.description}</td><td className="num font-semibold text-ink">{gbp(i.amount_gbp)}</td><td><StatusBadge status={i.status} /></td>
              <td><div className="flex items-center justify-end gap-1">
                {i.status !== "paid" && <form action={sendInvoice}><input type="hidden" name="id" value={i.id} /><button className="btn btn-ghost btn-sm">{i.status === "sent" ? "Resend" : "Email"}</button></form>}
                {i.status !== "paid" && i.kind === "invoice" && <form action={setInvoiceStatus}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="status" value="paid" /><button className="btn btn-ghost btn-sm">Mark paid</button></form>}
                {i.status !== "void" && i.status !== "paid" && <form action={setInvoiceStatus}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="status" value="void" /><button className="btn btn-ghost btn-sm">Void</button></form>}
                {i.pay_url && <a href={i.pay_url} className="btn btn-ghost btn-sm" target="_blank">Pay link<ExternalLink aria-hidden /></a>}
              </div></td></tr>); })}
        </tbody></table>
        {(invs ?? []).length === 0 && <EmptyState icon={Banknote} title="No invoices yet">Create an invoice or estimate with the New invoice button. It is emailed to the client with a payment link.</EmptyState>}
      </TableCard>
    </Page>
  );
}
