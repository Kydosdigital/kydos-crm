import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { matchList, type ListFilter } from "@/lib/lists";
import { STATE_LABEL } from "@/lib/engagement";
import { deleteField, deleteList, enrolList, saveField, saveList } from "../../actions";
import { Filter, ListFilter as ListFilterIcon, Megaphone, Plus, SlidersHorizontal, Workflow } from "lucide-react";
import { Alert, Avatar, Badge, Card, EmptyState, Field, Page, PageHeader, Section, TableCard, personName } from "@/components/ui";

const describe = (f: ListFilter) => [
  f.tags_all?.length && `has all tags: ${f.tags_all.join(", ")}`, f.tags_any?.length && `any tag: ${f.tags_any.join(", ")}`, f.tags_none?.length && `none of: ${f.tags_none.join(", ")}`,
  f.source && `source ${f.source}`, f.state && `state: ${STATE_LABEL[f.state as keyof typeof STATE_LABEL] ?? f.state}`, f.field && `field ${f.field}`,
  f.has_email && "has email", f.has_phone && "has phone", f.created_within_days && `created in last ${f.created_within_days} days`, f.q && `search "${f.q}"`,
].filter(Boolean).join("; ") || "everyone";

export default async function Lists({ searchParams }: { searchParams: Promise<{ enrolled?: string }> }) {
  const { enrolled } = await searchParams;
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const [{ data: lists }, { data: fields }, { data: autos }] = await Promise.all([
    db.from("smart_lists").select("*").eq("workspace_id", ws.id).order("name"),
    db.from("custom_fields").select("*").eq("workspace_id", ws.id).order("label"),
    db.from("automations").select("id,name").eq("workspace_id", ws.id).order("name"),
  ]);
  const counted = await Promise.all((lists ?? []).map(async (l) => ({ l, people: await matchList(ws.id, l.filter) })));
  return (
    <Page>
      <PageHeader title="Smart lists and custom fields" description="Segment your contacts with saved filters, and add the extra fields your business needs." />
      {enrolled && <Alert tone="success">Enrolled {enrolled} contacts.</Alert>}

      <Section title="Smart lists" description="Saved filters that update themselves. Enrol a list in an automation in one click, or send it a bulk email." className="mb-10">
        {counted.length === 0 && <div className="card mb-3"><EmptyState icon={ListFilterIcon} title="No smart lists yet">Create a list below, for example everyone tagged lead who was added in the last 30 days.</EmptyState></div>}
        <div className="mb-3 grid gap-4 lg:grid-cols-2">
          {counted.map(({ l, people }) => (
            <div key={l.id} className="card flex flex-col p-5 text-[13px]">
              <div className="flex items-start justify-between gap-3"><b className="flex items-center gap-2 text-[15px] font-semibold text-ink">{l.name} <Badge tone="brand">{people.length}</Badge></b>
                <form action={deleteList}><input type="hidden" name="id" value={l.id} /><button className="btn btn-danger btn-sm">Delete</button></form></div>
              <p className="mt-1.5 flex items-start gap-1.5 text-muted"><Filter className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{describe(l.filter)}</p>
              <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">{people.slice(0, 6).map((c) => <Link key={c.id} href={`/contacts/${c.id}`} className="link-quiet inline-flex items-center gap-1.5 !font-medium"><Avatar name={personName(c)} size="sm" />{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email}</Link>)}{people.length > 6 && <span className="text-muted">...</span>}</p>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                <form action={enrolList} className="flex flex-1 gap-1.5"><input type="hidden" name="list_id" value={l.id} />
                  <select name="automation_id" aria-label="Automation" className="select input-sm flex-1">{(autos ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
                  <button className="btn btn-secondary btn-sm"><Workflow aria-hidden />Enrol list</button></form>
                <Link href={`/broadcast?list=${l.id}`} className="btn btn-secondary btn-sm"><Megaphone aria-hidden />Email list</Link>
              </div>
            </div>
          ))}
        </div>
        <details className="disclosure card p-5">
          <summary className="text-sm"><Plus className="h-4 w-4 text-muted" aria-hidden />New smart list</summary>
          <form action={saveList} className="mt-4 grid grid-cols-2 gap-3">
            <Field label="List name" className="col-span-2"><input name="name" placeholder="List name" required className="input" /></Field>
            <Field label="Has all tags"><input name="tags_all" placeholder="Has all tags (comma separated)" className="input" /></Field>
            <Field label="Has any of these tags"><input name="tags_any" placeholder="Has any of these tags" className="input" /></Field>
            <Field label="Has none of these tags"><input name="tags_none" placeholder="Has none of these tags" className="input" /></Field>
            <Field label="Source"><input name="source" placeholder="Source, e.g. facebook-lead-ad" className="input" /></Field>
            <Field label="Engagement state"><select name="state" className="select"><option value="">Any engagement state</option>{Object.entries(STATE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Custom field"><input name="field" placeholder="Custom field, e.g. budget=high" className="input" /></Field>
            <Field label="Created in last N days"><input name="created_within_days" type="number" placeholder="Created in last N days" className="input" /></Field>
            <Field label="Search"><input name="q" placeholder="Name, email or company contains" className="input" /></Field>
            <label className="check-row"><input type="checkbox" name="has_email" className="checkbox" />Has email</label>
            <label className="check-row"><input type="checkbox" name="has_phone" className="checkbox" />Has phone</label>
            <button className="btn btn-primary col-span-2 justify-self-start">Save list</button>
          </form>
        </details>
      </Section>

      <Section title="Custom fields" description={<>Extra fields on every contact (budget, service wanted). They show on the contact page, work in smart lists and automation conditions (field:key=value), and as merge tags like {"{{budget}}"}.</>}>
        <TableCard className="mb-3">
          <table className="table"><thead><tr><th>Label</th><th>Key</th><th>Type</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
            {(fields ?? []).map((f) => <tr key={f.id}><td className="font-medium text-ink">{f.label}</td><td><code>{f.key}</code></td><td className="text-muted">{f.type}{f.options.length ? `: ${f.options.join(", ")}` : ""}</td>
              <td className="text-right"><form action={deleteField}><input type="hidden" name="id" value={f.id} /><button className="btn btn-danger btn-sm">Delete</button></form></td></tr>)}
          </tbody></table>
          {(fields ?? []).length === 0 && <EmptyState icon={SlidersHorizontal} title="No custom fields yet" className="!py-8">Add a field below to start capturing it on every contact.</EmptyState>}
        </TableCard>
        <Card>
          <form action={saveField} className="grid grid-cols-[1fr_10rem_1fr_auto] items-end gap-3">
            <Field label="Label"><input name="label" placeholder="Label, e.g. Budget" required className="input" /></Field>
            <Field label="Type"><select name="type" className="select"><option value="text">Text</option><option value="number">Number</option><option value="select">Dropdown</option><option value="date">Date</option></select></Field>
            <Field label="Dropdown options"><input name="options" placeholder="Dropdown options, comma separated" className="input" /></Field>
            <button className="btn btn-secondary"><Plus aria-hidden />Add field</button>
          </form>
        </Card>
      </Section>
    </Page>
  );
}
