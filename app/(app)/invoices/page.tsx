import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { createInvoice, sendInvoice, setInvoiceStatus } from "../../actions";

const gbp = (n: number) => `£${Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2 })}`;

export default async function Invoices({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const [{ data: invs }, { data: contacts }] = await Promise.all([
    db.from("invoices").select("*, contacts(id,first_name,last_name,email)").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(100),
    db.from("contacts").select("id,first_name,last_name,email,company").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(500),
  ]);
  const total = (st: string) => (invs ?? []).filter((i) => i.kind === "invoice" && i.status === st).reduce((a, i) => a + Number(i.amount_gbp), 0);
  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 text-2xl font-semibold">Invoices and estimates</h1>
      <p className="mb-4 text-sm text-gray-500">Outstanding {gbp(total("sent"))} · Paid {gbp(total("paid"))}. Invoices get a Stripe payment link when STRIPE_SECRET_KEY is set; paying marks them paid, tags the contact <code>paid</code> and tells Meta.</p>
      {error && <p className="mb-3 rounded bg-yellow-50 p-2 text-sm text-yellow-800">{error}</p>}
      <table className="mb-6 w-full text-left text-sm"><tbody>
        {(invs ?? []).map((i) => { const c = i.contacts as { id: string; first_name: string | null; last_name: string | null; email: string | null } | null; return (
          <tr key={i.id} className="border-b"><td className="py-2 font-medium">{i.number}</td>
            <td>{c ? <Link className="underline" href={`/contacts/${c.id}`}>{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email}</Link> : ""}</td>
            <td className="text-gray-600">{i.description}</td><td>{gbp(i.amount_gbp)}</td><td className="text-gray-500">{i.status}</td>
            <td className="flex gap-2 py-2 text-xs">
              {i.status !== "paid" && <form action={sendInvoice}><input type="hidden" name="id" value={i.id} /><button className="underline">{i.status === "sent" ? "Resend" : "Email"}</button></form>}
              {i.status !== "paid" && i.kind === "invoice" && <form action={setInvoiceStatus}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="status" value="paid" /><button className="underline">Mark paid</button></form>}
              {i.status !== "void" && i.status !== "paid" && <form action={setInvoiceStatus}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="status" value="void" /><button className="underline">Void</button></form>}
              {i.pay_url && <a href={i.pay_url} className="underline" target="_blank">Pay link</a>}
            </td></tr>); })}
      </tbody></table>
      <form action={createInvoice} className="grid grid-cols-2 gap-2 text-sm">
        <select name="contact_id" required className="col-span-2 rounded border p-2"><option value="">Choose contact</option>{(contacts ?? []).map((c) => <option key={c.id} value={c.id}>{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email}{c.company ? ` (${c.company})` : ""}</option>)}</select>
        <input name="description" required placeholder="What it is for, e.g. Monthly social media management" className="col-span-2 rounded border p-2" />
        <input name="amount" type="number" step="0.01" required placeholder="Amount (£)" className="rounded border p-2" />
        <input name="due_date" type="date" className="rounded border p-2" />
        <select name="kind" className="rounded border p-2"><option value="invoice">Invoice</option><option value="estimate">Estimate</option></select>
        <button className="rounded bg-black px-3 py-2 text-white">Create</button>
      </form>
    </div>
  );
}
