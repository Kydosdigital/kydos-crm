import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { matchList, type ListFilter } from "@/lib/lists";
import { STATE_LABEL } from "@/lib/engagement";
import { deleteField, deleteList, enrolList, saveField, saveList } from "../../actions";

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
    <div className="max-w-4xl">
      <h1 className="mb-4 text-2xl font-semibold">Smart lists and custom fields</h1>
      {enrolled && <p className="mb-3 rounded bg-green-50 p-2 text-sm text-green-700">Enrolled {enrolled} contacts.</p>}

      <h2 className="mb-2 font-semibold">Smart lists</h2>
      <p className="mb-3 text-sm text-gray-500">Saved filters that update themselves. Enrol a list in an automation in one click, or send it a bulk email.</p>
      {counted.map(({ l, people }) => (
        <div key={l.id} className="mb-3 rounded border p-3 text-sm">
          <div className="flex justify-between"><b>{l.name} <span className="font-normal text-gray-500">({people.length})</span></b>
            <form action={deleteList}><input type="hidden" name="id" value={l.id} /><button className="text-xs text-gray-500 underline">Delete</button></form></div>
          <p className="text-gray-600">{describe(l.filter)}</p>
          <p className="mt-1 text-gray-500">{people.slice(0, 6).map((c) => <Link key={c.id} href={`/contacts/${c.id}`} className="mr-2 underline">{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email}</Link>)}{people.length > 6 && "..."}</p>
          <div className="mt-2 flex gap-2">
            <form action={enrolList} className="flex gap-1"><input type="hidden" name="list_id" value={l.id} />
              <select name="automation_id" className="rounded border p-1">{(autos ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
              <button className="rounded border px-2">Enrol list</button></form>
            <Link href={`/broadcast?list=${l.id}`} className="rounded border px-2 py-1">Email list</Link>
          </div>
        </div>
      ))}
      <details className="mb-8 rounded border p-3 text-sm">
        <summary className="cursor-pointer font-medium">New smart list</summary>
        <form action={saveList} className="mt-2 grid grid-cols-2 gap-2">
          <input name="name" placeholder="List name" required className="col-span-2 rounded border p-1" />
          <input name="tags_all" placeholder="Has all tags (comma separated)" className="rounded border p-1" />
          <input name="tags_any" placeholder="Has any of these tags" className="rounded border p-1" />
          <input name="tags_none" placeholder="Has none of these tags" className="rounded border p-1" />
          <input name="source" placeholder="Source, e.g. facebook-lead-ad" className="rounded border p-1" />
          <select name="state" className="rounded border p-1"><option value="">Any engagement state</option>{Object.entries(STATE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <input name="field" placeholder="Custom field, e.g. budget=high" className="rounded border p-1" />
          <input name="created_within_days" type="number" placeholder="Created in last N days" className="rounded border p-1" />
          <input name="q" placeholder="Name, email or company contains" className="rounded border p-1" />
          <label><input type="checkbox" name="has_email" className="mr-1" />Has email</label>
          <label><input type="checkbox" name="has_phone" className="mr-1" />Has phone</label>
          <button className="col-span-2 rounded bg-black px-3 py-1.5 text-white">Save list</button>
        </form>
      </details>

      <h2 className="mb-2 font-semibold">Custom fields</h2>
      <p className="mb-3 text-sm text-gray-500">Extra fields on every contact (budget, service wanted). They show on the contact page, work in smart lists and automation conditions (field:key=value), and as merge tags like {"{{budget}}"}.</p>
      <table className="mb-3 w-full text-left text-sm"><tbody>
        {(fields ?? []).map((f) => <tr key={f.id} className="border-b"><td className="py-1">{f.label}</td><td className="text-gray-500">{f.key}</td><td className="text-gray-500">{f.type}{f.options.length ? `: ${f.options.join(", ")}` : ""}</td>
          <td className="text-right"><form action={deleteField}><input type="hidden" name="id" value={f.id} /><button className="text-xs text-gray-500 underline">Delete</button></form></td></tr>)}
      </tbody></table>
      <form action={saveField} className="grid grid-cols-4 gap-2 text-sm">
        <input name="label" placeholder="Label, e.g. Budget" required className="rounded border p-1" />
        <select name="type" className="rounded border p-1"><option value="text">Text</option><option value="number">Number</option><option value="select">Dropdown</option><option value="date">Date</option></select>
        <input name="options" placeholder="Dropdown options, comma separated" className="rounded border p-1" />
        <button className="rounded border px-2">Add field</button>
      </form>
    </div>
  );
}
