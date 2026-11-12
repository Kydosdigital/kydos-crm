import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { createContact } from "../../actions";

export default async function Contacts({ searchParams }: { searchParams: Promise<{ q?: string; tag?: string; error?: string }> }) {
  const { q, tag, error } = await searchParams;
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  let query = db.from("contacts").select("*").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(200);
  if (q) query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,company.ilike.%${q}%`);
  if (tag) query = query.contains("tags", [tag]);
  const { data: contacts } = await query;

  return (
    <div className="max-w-5xl">
      <div className="mb-4 flex items-center justify-between"><h1 className="text-2xl font-semibold">Contacts</h1><Link href="/contacts/import" className="rounded border px-3 py-1 text-sm">Import CSV</Link></div>
      {error && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <form className="mb-4 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Search name, email, phone, company" className="w-80 rounded border p-2" />
        <input name="tag" defaultValue={tag} placeholder="Tag" className="w-40 rounded border p-2" />
        <button className="rounded border px-3">Filter</button>
      </form>
      <table className="mb-8 w-full text-left text-sm">
        <thead className="border-b text-gray-500">
          <tr><th className="py-2">Name</th><th>Email</th><th>Phone</th><th>Tags</th></tr>
        </thead>
        <tbody>
          {(contacts ?? []).map((c) => (
            <tr key={c.id} className="border-b hover:bg-gray-50">
              <td className="py-2"><Link className="underline" href={`/contacts/${c.id}`}>{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || c.phone}</Link></td>
              <td>{c.email}</td>
              <td>{c.phone}</td>
              <td>{c.tags.join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mb-2 font-semibold">Add contact</h2>
      <form action={createContact} className="grid max-w-xl grid-cols-2 gap-2">
        <input name="first_name" placeholder="First name" className="rounded border p-2" />
        <input name="last_name" placeholder="Last name" className="rounded border p-2" />
        <input name="email" type="email" placeholder="Email" className="rounded border p-2" />
        <input name="phone" placeholder="Phone (07... or +44...)" className="rounded border p-2" />
        <input name="company" placeholder="Company" className="rounded border p-2" />
        <input name="tags" placeholder="Tags, comma separated" className="rounded border p-2" />
        <input name="consent_note" placeholder="How did they consent to marketing? (PECR evidence)" className="col-span-2 rounded border p-2" />
        <button className="col-span-2 rounded bg-black p-2 text-white">Add contact</button>
      </form>
    </div>
  );
}
