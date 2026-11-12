import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { createProposal, sendProposal, deleteProposal } from "../../actions";

export default async function Proposals({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const app = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const [{ data: props }, { data: contacts }] = await Promise.all([
    db.from("proposals").select("*, contacts(id,first_name,last_name,email)").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(100),
    db.from("contacts").select("id,first_name,last_name,email,company").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(500),
  ]);
  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 text-2xl font-semibold">Proposals</h1>
      <p className="mb-4 text-sm text-gray-500">Write a proposal, email the client a private link, and they can read it and click Accept with their typed name. You are alerted when it is opened, accepted or declined, and the contact is tagged <code>proposal-accepted</code>.</p>
      {error && <p className="mb-3 rounded bg-yellow-50 p-2 text-sm text-yellow-800">{error}</p>}
      <table className="mb-6 w-full text-left text-sm"><tbody>
        {(props ?? []).map((p) => { const c = p.contacts as { id: string; first_name: string | null; last_name: string | null; email: string | null } | null; return (
          <tr key={p.id} className="border-b"><td className="py-2 font-medium">{p.title}</td>
            <td>{c ? <Link className="underline" href={`/contacts/${c.id}`}>{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email}</Link> : ""}</td>
            <td>{p.amount_gbp != null ? `£${Number(p.amount_gbp).toLocaleString("en-GB")}` : ""}</td>
            <td className="text-gray-500">{p.status}{p.status === "accepted" ? ` by ${p.signed_name}` : ""}</td>
            <td className="flex gap-2 py-2 text-xs">
              {p.status !== "accepted" && p.status !== "declined" && <form action={sendProposal}><input type="hidden" name="id" value={p.id} /><button className="underline">{p.status === "draft" ? "Email to client" : "Resend"}</button></form>}
              <a href={`${app}/f/proposal/${p.token}`} target="_blank" className="underline">{p.status === "draft" ? "Preview after sending" : "Open"}</a>
              <form action={deleteProposal}><input type="hidden" name="id" value={p.id} /><button className="underline">Delete</button></form>
            </td></tr>); })}
      </tbody></table>
      <form action={createProposal} className="flex flex-col gap-2 text-sm">
        <select name="contact_id" required className="rounded border p-2"><option value="">Choose contact</option>{(contacts ?? []).map((c) => <option key={c.id} value={c.id}>{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email}{c.company ? ` (${c.company})` : ""}</option>)}</select>
        <div className="flex gap-2"><input name="title" required placeholder="Title, e.g. Social media management proposal" className="flex-1 rounded border p-2" /><input name="amount" type="number" step="0.01" placeholder="Total (£, optional)" className="w-40 rounded border p-2" /></div>
        <textarea name="body" rows={12} required placeholder={"Write the proposal. Blank line = new paragraph.\n## Heading\n- bullet points\n**bold**\n[button: See our work | https://...]"} className="rounded border p-2" />
        <button className="self-start rounded bg-black px-4 py-2 text-white">Save proposal</button>
      </form>
    </div>
  );
}
