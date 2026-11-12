import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { createContact } from "../../actions";
import { Search, Upload, UserPlus, Users, X } from "lucide-react";
import { Alert, Avatar, Badge, EmptyState, Field, Page, PageHeader, TableCard, dateOnly, personName } from "@/components/ui";
import { Modal } from "@/components/ui/modal";

export default async function Contacts({ searchParams }: { searchParams: Promise<{ q?: string; tag?: string; error?: string }> }) {
  const { q, tag, error } = await searchParams;
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  let query = db.from("contacts").select("*").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(200);
  if (q) query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,company.ilike.%${q}%`);
  if (tag) query = query.contains("tags", [tag]);
  const { data: contacts } = await query;

  const rows = contacts ?? [];
  const filtered = !!(q || tag);

  return (
    <Page>
      <PageHeader
        title="Contacts"
        meta={<Badge tone="outline">{rows.length}{rows.length === 200 ? "+" : ""}</Badge>}
        description="Everyone you are talking to: leads, clients and suppliers. Open a contact to message them, add tasks or move them through the pipeline."
        actions={<>
          <Link href="/contacts/import" className="btn btn-secondary"><Upload aria-hidden />Import CSV</Link>
          <Modal trigger={<><UserPlus aria-hidden />Add contact</>} title="Add contact" description="Only one of email or phone is needed to get started.">
            <form action={createContact} className="grid grid-cols-2 gap-3">
              <Field label="First name"><input name="first_name" placeholder="First name" className="input" /></Field>
              <Field label="Last name"><input name="last_name" placeholder="Last name" className="input" /></Field>
              <Field label="Email"><input name="email" type="email" placeholder="Email" className="input" /></Field>
              <Field label="Phone"><input name="phone" placeholder="Phone (07... or +44...)" className="input" /></Field>
              <Field label="Company"><input name="company" placeholder="Company" className="input" /></Field>
              <Field label="Tags"><input name="tags" placeholder="Tags, comma separated" className="input" /></Field>
              <Field label="Marketing consent" hint="Kept as your PECR evidence." className="col-span-2"><input name="consent_note" placeholder="How did they consent to marketing? (PECR evidence)" className="input" /></Field>
              <button className="btn btn-primary col-span-2 mt-1">Add contact</button>
            </form>
          </Modal>
        </>}
      />
      {error && <Alert tone="danger">{error}</Alert>}
      <form className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-80">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
          <input name="q" defaultValue={q} placeholder="Search name, email, phone, company" aria-label="Search contacts" className="input !pl-8" />
        </div>
        <input name="tag" defaultValue={tag} placeholder="Tag" aria-label="Filter by tag" className="input !w-40" />
        <button className="btn btn-secondary">Filter</button>
        {filtered && <Link href="/contacts" className="btn btn-ghost"><X aria-hidden />Clear</Link>}
      </form>
      <TableCard>
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Phone</th><th>Tags</th><th>Added</th></tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || c.phone;
              return (
                <tr key={c.id}>
                  <td>
                    <Link className="group flex items-center gap-3" href={`/contacts/${c.id}`}>
                      <Avatar name={personName(c)} />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-ink group-hover:text-brand-text">{name}</span>
                        {c.company && <span className="block truncate text-xs text-muted">{c.company}</span>}
                      </span>
                    </Link>
                  </td>
                  <td>{c.email}</td>
                  <td className="tabular whitespace-nowrap">{c.phone}</td>
                  <td><div className="flex max-w-xs flex-wrap gap-1">{c.tags.map((t: string) => <Link key={t} href={`/contacts?tag=${encodeURIComponent(t)}`} className="badge hover:text-ink">{t}</Link>)}</div></td>
                  <td className="whitespace-nowrap text-muted">{c.created_at ? dateOnly(c.created_at) : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <EmptyState icon={Users} title={filtered ? "No contacts match that filter" : "No contacts yet"}>
            {filtered ? "Try a different search or clear the filter." : "Add your first contact, or import a CSV to bring everyone across in one go."}
          </EmptyState>
        )}
      </TableCard>
    </Page>
  );
}
