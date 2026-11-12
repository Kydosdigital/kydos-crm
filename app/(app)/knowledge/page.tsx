import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { deleteKnowledge, saveKnowledge, toggleKnowledge } from "../../actions";

const kinds: [string, string][] = [
  ["service", "Service (what we sell, price band, who it suits)"],
  ["offer_ladder", "Offer ladder (what to upsell after what)"],
  ["case_study", "Case study or result (proof point)"],
  ["objection", "Objection and how to answer it"],
  ["faq", "FAQ"],
  ["tone", "Tone of voice"],
  ["rule", "Hard rule (never say or do)"],
];

export default async function Knowledge() {
  const { ws } = await requireWorkspace();
  const { data } = await (await supabaseServer()).from("knowledge_items").select("*").eq("workspace_id", ws.id).order("kind").order("title");
  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-2xl font-semibold">Knowledge base</h1>
      <p className="mb-4 text-sm text-gray-500">What the communications agent knows about {ws.name}. It only uses active items and never invents services, prices or results beyond what is written here. Use the MCP connection to bulk-add items from chat.</p>
      {(data ?? []).map((k) => (
        <details key={k.id} className={`mb-2 rounded border p-3 text-sm ${k.active ? "" : "opacity-50"}`}>
          <summary className="cursor-pointer"><span className="mr-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs">{k.kind}</span><b>{k.title}</b></summary>
          <form action={saveKnowledge} className="mt-2 flex flex-col gap-2">
            <input type="hidden" name="id" value={k.id} />
            <select name="kind" defaultValue={k.kind} className="rounded border p-1">{kinds.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <input name="title" defaultValue={k.title} className="rounded border p-2" />
            <textarea name="body" rows={6} defaultValue={k.body} className="rounded border p-2" />
            <button className="self-start rounded bg-black px-3 py-1.5 text-white">Save</button>
          </form>
          <div className="mt-2 flex gap-3">
            <form action={toggleKnowledge}><input type="hidden" name="id" value={k.id} /><input type="hidden" name="active" value={String(!k.active)} /><button className="text-xs underline">{k.active ? "Disable" : "Enable"}</button></form>
            <form action={deleteKnowledge}><input type="hidden" name="id" value={k.id} /><button className="text-xs text-red-700 underline">Delete</button></form>
          </div>
        </details>
      ))}
      <h2 className="mb-2 mt-6 font-semibold">Add item</h2>
      <form action={saveKnowledge} className="flex flex-col gap-2">
        <select name="kind" className="rounded border p-2">{kinds.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <input name="title" placeholder="Title, e.g. Local SEO package" required className="rounded border p-2" />
        <textarea name="body" rows={6} placeholder="Details the agent can rely on" required className="rounded border p-2" />
        <button className="self-start rounded bg-black px-4 py-2 text-white">Add</button>
      </form>
    </div>
  );
}
