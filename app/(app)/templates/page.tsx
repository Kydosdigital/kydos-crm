import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { deleteTemplate, saveTemplate } from "../../actions";

export default async function Templates() {
  const { ws } = await requireWorkspace();
  const { data } = await (await supabaseServer()).from("email_templates").select("*").eq("workspace_id", ws.id).order("name");
  return (
    <div className="max-w-2xl">
      <h1 className="mb-4 text-2xl font-semibold">Email templates</h1>
      {(data ?? []).map((t) => (
        <div key={t.id} className="mb-3 rounded border p-3 text-sm">
          <div className="flex justify-between"><b>{t.name}</b>
            <form action={deleteTemplate}><input type="hidden" name="id" value={t.id} /><button className="text-xs text-gray-500 underline">Delete</button></form></div>
          <div className="text-gray-600">{t.subject}</div>
          <pre className="mt-1 whitespace-pre-wrap font-sans">{t.body}</pre>
        </div>
      ))}
      <h2 className="mb-2 mt-6 font-semibold">New template</h2>
      <form action={saveTemplate} className="flex flex-col gap-2">
        <input name="name" placeholder="Template name" required className="rounded border p-2" />
        <input name="subject" placeholder="Subject" required className="rounded border p-2" />
        <textarea name="body" rows={8} placeholder="Body. Use {{first_name}}." required className="rounded border p-2" />
        <button className="self-start rounded bg-black px-4 py-2 text-white">Save template</button>
      </form>
      <p className="mt-2 text-xs text-gray-500">Open a contact and pick a template to fill the message box.</p>
    </div>
  );
}
