import Link from "next/link";
import { requireStaff } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { createRetainer, sendRetainerLink, cancelRetainer } from "../../actions";
import { ExternalLink, Plus, Repeat, TrendingUp, Users } from "lucide-react";
import { Alert, EmptyState, Field, Page, PageHeader, Stat, StatusBadge, TableCard } from "@/components/ui";
import { Modal } from "@/components/ui/modal";

const gbp = (n: number) => `£${Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2 })}`;

export default async function Retainers({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { ws } = await requireStaff();
  const db = await supabaseServer();
  const [{ data: rets }, { data: contacts }] = await Promise.all([
    db.from("retainers").select("*, contacts(id,first_name,last_name,email)").eq("workspace_id", ws.id).order("created_at", { ascending: false }),
    db.from("contacts").select("id,first_name,last_name,email,company").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(500),
  ]);
  const mrr = (rets ?? []).filter((r) => r.status === "active" || r.status === "past_due").reduce((a, r) => a + Number(r.amount_gbp), 0);
  const live = (rets ?? []).filter((r) => r.status === "active" || r.status === "past_due").length;
  return (
    <Page>
      <PageHeader
        title="Retainers"
        description={<>Create a retainer, email the client the card link, and Stripe bills them every month. Failed payments tag the contact <code>payment-failed</code> and alert you.</>}
        actions={
          <Modal trigger={<><Plus aria-hidden />New retainer</>} title="New retainer" description="The client is billed monthly once they enter their card.">
            <form action={createRetainer} className="grid grid-cols-2 gap-3">
              <Field label="Contact" className="col-span-2"><select name="contact_id" required className="select"><option value="">Choose contact</option>{(contacts ?? []).map((c) => <option key={c.id} value={c.id}>{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email}{c.company ? ` (${c.company})` : ""}</option>)}</select></Field>
              <Field label="Description"><input name="description" required placeholder="e.g. Monthly social media management" className="input" /></Field>
              <Field label="Monthly amount (£)"><input name="amount" type="number" step="0.01" required placeholder="Monthly amount (£)" className="input" /></Field>
              <button className="btn btn-primary col-span-2 mt-1">Create retainer</button>
            </form>
          </Modal>
        }
      />
      {error && <Alert tone="warning">{error}</Alert>}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <Stat label="Monthly recurring revenue" value={gbp(mrr)} icon={TrendingUp} tone="brand" />
        <Stat label="Annual run rate" value={gbp(mrr * 12)} icon={Repeat} />
        <Stat label="Billing clients" value={live} icon={Users} />
      </div>
      <TableCard>
        <table className="table"><thead><tr><th>Client</th><th>Description</th><th className="num">Amount</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
          {(rets ?? []).map((r) => { const c = r.contacts as { id: string; first_name: string | null; last_name: string | null; email: string | null } | null; return (
            <tr key={r.id}><td className="whitespace-nowrap">{c ? <Link className="link-quiet" href={`/contacts/${c.id}`}>{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email}</Link> : ""}</td>
              <td className="max-w-xs truncate text-muted">{r.description}</td><td className="num font-semibold text-ink">{gbp(r.amount_gbp)}<span className="font-normal text-muted">/mo</span></td><td className="whitespace-nowrap"><StatusBadge status={r.status} />{r.paid_count ? <span className="ml-2 text-xs text-muted">{r.paid_count} paid</span> : ""}</td>
              <td><div className="flex items-center justify-end gap-1">
                {r.status === "pending" && r.checkout_url && <form action={sendRetainerLink}><input type="hidden" name="id" value={r.id} /><button className="btn btn-ghost btn-sm">Email card link</button></form>}
                {r.status === "pending" && r.checkout_url && <a href={r.checkout_url} className="btn btn-ghost btn-sm" target="_blank">Card link<ExternalLink aria-hidden /></a>}
                {r.status !== "cancelled" && <form action={cancelRetainer}><input type="hidden" name="id" value={r.id} /><button className="btn btn-danger btn-sm">Cancel</button></form>}
              </div></td></tr>); })}
        </tbody></table>
        {(rets ?? []).length === 0 && <EmptyState icon={Repeat} title="No retainers yet">Set up a monthly retainer with the New retainer button and send the client their card link.</EmptyState>}
      </TableCard>
    </Page>
  );
}
