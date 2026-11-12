import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { createRetainer, sendRetainerLink, cancelRetainer } from "../../actions";

const gbp = (n: number) => `£${Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2 })}`;

export default async function Retainers({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const [{ data: rets }, { data: contacts }] = await Promise.all([
    db.from("retainers").select("*, contacts(id,first_name,last_name,email)").eq("workspace_id", ws.id).order("created_at", { ascending: false }),
    db.from("contacts").select("id,first_name,last_name,email,company").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(500),
  ]);
  const mrr = (rets ?? []).filter((r) => r.status === "active" || r.status === "past_due").reduce((a, r) => a + Number(r.amount_gbp), 0);
  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 text-2xl font-semibold">Retainers</h1>
      <p className="mb-4 text-sm text-gray-500">Monthly recurring revenue {gbp(mrr)}. Create a retainer, email the client the card link, and Stripe bills them every month. Failed payments tag the contact <code>payment-failed</code> and alert you.</p>
      {error && <p className="mb-3 rounded bg-yellow-50 p-2 text-sm text-yellow-800">{error}</p>}
      <table className="mb-6 w-full text-left text-sm"><tbody>
        {(rets ?? []).map((r) => { const c = r.contacts as { id: string; first_name: string | null; last_name: string | null; email: string | null } | null; return (
          <tr key={r.id} className="border-b"><td className="py-2">{c ? <Link className="underline" href={`/contacts/${c.id}`}>{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email}</Link> : ""}</td>
            <td className="text-gray-600">{r.description}</td><td>{gbp(r.amount_gbp)}/mo</td><td className="text-gray-500">{r.status}{r.paid_count ? ` · ${r.paid_count} paid` : ""}</td>
            <td className="flex gap-2 py-2 text-xs">
              {r.status === "pending" && r.checkout_url && <form action={sendRetainerLink}><input type="hidden" name="id" value={r.id} /><button className="underline">Email card link</button></form>}
              {r.status === "pending" && r.checkout_url && <a href={r.checkout_url} className="underline" target="_blank">Card link</a>}
              {r.status !== "cancelled" && <form action={cancelRetainer}><input type="hidden" name="id" value={r.id} /><button className="underline">Cancel</button></form>}
            </td></tr>); })}
      </tbody></table>
      <form action={createRetainer} className="grid grid-cols-2 gap-2 text-sm">
        <select name="contact_id" required className="col-span-2 rounded border p-2"><option value="">Choose contact</option>{(contacts ?? []).map((c) => <option key={c.id} value={c.id}>{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email}{c.company ? ` (${c.company})` : ""}</option>)}</select>
        <input name="description" required placeholder="e.g. Monthly social media management" className="rounded border p-2" />
        <input name="amount" type="number" step="0.01" required placeholder="Monthly amount (£)" className="rounded border p-2" />
        <button className="col-span-2 rounded bg-black px-3 py-2 text-white">Create retainer</button>
      </form>
    </div>
  );
}
