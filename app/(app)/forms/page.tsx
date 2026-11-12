import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { deleteForm, saveForm, toggleForm } from "../../actions";

const DEFAULT_FIELDS = "first_name | First name | text | required\nemail | Email | email | required\nphone | Phone | tel | optional\nmessage | How can we help? | textarea | optional";

export default async function Forms({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const { data: forms } = await db.from("hosted_forms").select("*").eq("workspace_id", ws.id).order("created_at");
  const app = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 text-2xl font-semibold">Forms</h1>
      <p className="mb-4 text-sm text-gray-500">Hosted forms feed straight into the CRM with consent recorded. Use the exit-intent popup on your website, or embed a form inline. Submissions fire the Form submitted automation trigger.</p>
      {error && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      {(forms ?? []).map((f) => (
        <div key={f.id} className="mb-4 rounded border p-3 text-sm">
          <div className="flex items-center justify-between">
            <b>{f.name} <span className="font-normal text-gray-500">/{f.slug} · {f.views} views · {f.submissions} leads · {f.views ? Math.round((f.submissions / f.views) * 100) : 0}% convert{f.exit_intent ? " · exit-intent popup" : ""}</span></b>
            <span className="flex gap-3">
              <form action={toggleForm}><input type="hidden" name="id" value={f.id} /><input type="hidden" name="active" value={f.active ? "0" : "1"} /><button className="text-xs underline">{f.active ? "Pause" : "Activate"}</button></form>
              <form action={deleteForm}><input type="hidden" name="id" value={f.id} /><button className="text-xs text-gray-500 underline">Delete</button></form>
            </span>
          </div>
          <p className="mt-2 text-gray-600">Hosted page: <a className="underline" target="_blank" href={`${app}/f/form/${f.slug}?ws=${ws.slug}`}>{`${app}/f/form/${f.slug}?ws=${ws.slug}`}</a></p>
          <p className="mt-2 text-gray-600">Paste before &lt;/body&gt; on your website (popup{f.exit_intent ? " on exit intent" : ""}):</p>
          <pre className="overflow-x-auto rounded bg-gray-50 p-2 text-xs">{`<script src="${app}/api/embed/${f.slug}.js?ws=${ws.slug}" async></script>`}</pre>
          <p className="mt-2 text-gray-600">Or inline: add &lt;div id=&quot;kydos-form&quot;&gt;&lt;/div&gt; and</p>
          <pre className="overflow-x-auto rounded bg-gray-50 p-2 text-xs">{`<script src="${app}/api/embed/${f.slug}.js?ws=${ws.slug}" data-inline="#kydos-form" async></script>`}</pre>
          <details className="mt-2"><summary className="cursor-pointer">Edit</summary>
            <FormEditor f={f} /></details>
        </div>
      ))}
      <details className="rounded border p-3 text-sm" open={!(forms ?? []).length}>
        <summary className="cursor-pointer font-medium">New form</summary>
        <FormEditor />
      </details>
    </div>
  );
}

type F = { slug: string; name: string; headline: string; intro: string | null; button_text: string; success_message: string; consent_text: string; tags: string[]; exit_intent: boolean; popup_delay_seconds: number; fields: { key: string; label: string; type: string; required?: boolean }[] };
function FormEditor({ f }: { f?: F }) {
  return (
    <form action={saveForm} className="mt-2 grid grid-cols-2 gap-2">
      <input name="name" placeholder="Internal name" defaultValue={f?.name} required className="rounded border p-1" />
      <input name="slug" placeholder="URL name, e.g. website-contact" defaultValue={f?.slug} required readOnly={!!f} className="rounded border p-1" />
      <input name="headline" placeholder="Headline" defaultValue={f?.headline ?? "Get in touch"} className="col-span-2 rounded border p-1" />
      <input name="intro" placeholder="Intro line (optional)" defaultValue={f?.intro ?? ""} className="col-span-2 rounded border p-1" />
      <textarea name="fields" rows={5} defaultValue={f ? f.fields.map((x) => `${x.key} | ${x.label} | ${x.type} | ${x.required ? "required" : "optional"}`).join("\n") : DEFAULT_FIELDS} className="col-span-2 rounded border p-1 font-mono text-xs" />
      <p className="col-span-2 text-xs text-gray-500">One field per line: key | label | type | required. Types: text, email, tel, textarea, number, date. Keys first_name, last_name, email, phone and company fill the contact; any other key becomes a custom field value (and a note if the key is message).</p>
      <input name="button_text" placeholder="Button text" defaultValue={f?.button_text ?? "Send"} className="rounded border p-1" />
      <input name="tags" placeholder="Tags to add, comma separated" defaultValue={f?.tags?.join(", ") ?? ""} className="rounded border p-1" />
      <input name="success_message" placeholder="Thank-you message" defaultValue={f?.success_message} className="col-span-2 rounded border p-1" />
      <input name="consent_text" placeholder="Consent wording" defaultValue={f?.consent_text} className="col-span-2 rounded border p-1" />
      <label><input type="checkbox" name="exit_intent" defaultChecked={f?.exit_intent} className="mr-1" />Show as popup when a visitor is about to leave</label>
      <input name="popup_delay_seconds" type="number" placeholder="Delay in seconds" defaultValue={f?.popup_delay_seconds ?? 0} className="rounded border p-1" />
      <button className="col-span-2 rounded bg-black px-3 py-1.5 text-white">Save form</button>
    </form>
  );
}
