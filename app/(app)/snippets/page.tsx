import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { deleteSnippet, saveSnippet } from "../../actions";

export default async function Snippets() {
  const { ws } = await requireWorkspace();
  const { data } = await (await supabaseServer()).from("snippets").select("*").eq("workspace_id", ws.id).order("name");
  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-2xl font-semibold">Text snippets</h1>
      <p className="mb-4 text-sm text-gray-500">Reusable replies for WhatsApp, SMS and email. They appear as one-click links under the message box on every contact.</p>
      {(data ?? []).map((x) => (
        <div key={x.id} className="mb-2 rounded border p-3 text-sm"><div className="flex justify-between"><b>{x.name}</b><form action={deleteSnippet}><input type="hidden" name="id" value={x.id} /><button className="text-xs underline">Delete</button></form></div><p className="mt-1 whitespace-pre-wrap text-gray-700">{x.body}</p></div>
      ))}
      <form action={saveSnippet} className="mt-4 flex flex-col gap-2 text-sm">
        <input name="name" required placeholder="Name, e.g. Pricing reply" className="rounded border p-2" />
        <textarea name="body" required rows={4} placeholder="Text. You can use first_name in double curly braces." className="rounded border p-2" />
        <button className="self-start rounded bg-black px-4 py-2 text-white">Save snippet</button>
      </form>
    </div>
  );
}
