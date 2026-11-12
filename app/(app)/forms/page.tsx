import { requireStaff } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { deleteForm, saveForm, toggleForm } from "../../actions";
import { ExternalLink, FormInput, Pause, Play, Plus } from "lucide-react";
import { Alert, Badge, EmptyState, Field, Page, PageHeader } from "@/components/ui";
import { CodeBlock } from "@/components/ui/copy-button";
import { FieldBuilder } from "@/components/ui/field-builder";

const DEFAULT_FIELDS = "first_name | First name | text | required\nemail | Email | email | required\nphone | Phone | tel | optional\nmessage | How can we help? | textarea | optional";

export default async function Forms({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { ws } = await requireStaff();
  const db = await supabaseServer();
  const { data: forms } = await db.from("hosted_forms").select("*").eq("workspace_id", ws.id).order("created_at");
  const app = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return (
    <Page>
      <PageHeader title="Forms" description="Hosted forms feed straight into the CRM with consent recorded. Use the exit-intent popup on your website, or embed a form inline. Submissions fire the Form submitted automation trigger." />
      {error && <Alert tone="danger">{error}</Alert>}
      {(forms ?? []).length === 0 && <div className="card mb-4"><EmptyState icon={FormInput} title="No forms yet">Create your first form below. You get a hosted page, a popup script and an inline embed.</EmptyState></div>}
      <div className="flex flex-col gap-4">
        {(forms ?? []).map((f) => (
          <div key={f.id} className={`card overflow-hidden ${f.active ? "" : "opacity-80"}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><b className="text-[15px] font-semibold text-ink">{f.name}</b>{f.active ? <Badge tone="success" dot>Live</Badge> : <Badge dot>Paused</Badge>}{f.exit_intent ? <Badge tone="violet">exit-intent popup</Badge> : null}</div>
                <div className="mt-0.5 font-mono text-xs text-muted">/{f.slug}</div>
              </div>
              <div className="flex items-center gap-6">
                {[["views", f.views], ["leads", f.submissions], ["convert", `${f.views ? Math.round((f.submissions / f.views) * 100) : 0}%`]].map(([l, v]) => (
                  <div key={String(l)} className="text-right"><div className="tabular text-lg font-semibold leading-tight text-ink">{v}</div><div className="text-[11px] text-muted">{l}</div></div>
                ))}
                <span className="flex gap-1">
                  <form action={toggleForm}><input type="hidden" name="id" value={f.id} /><input type="hidden" name="active" value={f.active ? "0" : "1"} /><button className="btn btn-secondary btn-sm">{f.active ? <Pause aria-hidden /> : <Play aria-hidden />}{f.active ? "Pause" : "Activate"}</button></form>
                  <form action={deleteForm}><input type="hidden" name="id" value={f.id} /><button className="btn btn-danger btn-sm">Delete</button></form>
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-4 px-5 py-4 text-[13px]">
              <div><p className="label">Hosted page</p><a className="link inline-flex items-center gap-1 break-all" target="_blank" href={`${app}/f/form/${f.slug}?ws=${ws.slug}`}>{`${app}/f/form/${f.slug}?ws=${ws.slug}`}<ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden /></a></div>
              <div><p className="label">Paste before &lt;/body&gt; on your website (popup{f.exit_intent ? " on exit intent" : ""}):</p>
                <CodeBlock code={`<script src="${app}/api/embed/${f.slug}.js?ws=${ws.slug}" async></script>`} /></div>
              <div><p className="label">Or inline: add &lt;div id=&quot;kydos-form&quot;&gt;&lt;/div&gt; and</p>
                <CodeBlock code={`<script src="${app}/api/embed/${f.slug}.js?ws=${ws.slug}" data-inline="#kydos-form" async></script>`} /></div>
              <details className="disclosure border-t border-line pt-4"><summary className="text-[13px]">Edit</summary>
                <FormEditor f={f} /></details>
            </div>
          </div>
        ))}
        <details className="disclosure card p-5" open={!(forms ?? []).length}>
          <summary className="text-sm"><Plus className="h-4 w-4 text-muted" aria-hidden />New form</summary>
          <FormEditor />
        </details>
      </div>
    </Page>
  );
}

type F = { slug: string; name: string; headline: string; intro: string | null; button_text: string; success_message: string; consent_text: string; tags: string[]; exit_intent: boolean; popup_delay_seconds: number; fields: { key: string; label: string; type: string; required?: boolean }[] };
function FormEditor({ f }: { f?: F }) {
  return (
    <form action={saveForm} className="mt-4 grid grid-cols-2 gap-3">
      <Field label="Internal name"><input name="name" placeholder="Internal name" defaultValue={f?.name} required className="input" /></Field>
      <Field label="URL name" hint={f ? "The URL name cannot be changed once the form exists." : undefined}><input name="slug" placeholder="URL name, e.g. website-contact" defaultValue={f?.slug} required readOnly={!!f} className="input" /></Field>
      <Field label="Headline" className="col-span-2"><input name="headline" placeholder="Headline" defaultValue={f?.headline ?? "Get in touch"} className="input" /></Field>
      <Field label="Intro line" className="col-span-2"><input name="intro" placeholder="Intro line (optional)" defaultValue={f?.intro ?? ""} className="input" /></Field>
      <Field label="Fields" className="col-span-2" hint="Keys first_name, last_name, email, phone and company fill the contact; any other field becomes a custom value (message also becomes a note).">
        <FieldBuilder defaultValue={f ? f.fields.map((x) => `${x.key} | ${x.label} | ${x.type} | ${x.required ? "required" : "optional"}`).join("\n") : DEFAULT_FIELDS} />
      </Field>
      <Field label="Button text"><input name="button_text" placeholder="Button text" defaultValue={f?.button_text ?? "Send"} className="input" /></Field>
      <Field label="Tags to add"><input name="tags" placeholder="Tags to add, comma separated" defaultValue={f?.tags?.join(", ") ?? ""} className="input" /></Field>
      <Field label="Thank-you message" className="col-span-2"><input name="success_message" placeholder="Thank-you message" defaultValue={f?.success_message} className="input" /></Field>
      <Field label="Consent wording" className="col-span-2"><input name="consent_text" placeholder="Consent wording" defaultValue={f?.consent_text} className="input" /></Field>
      <label className="check-row self-end pb-2"><input type="checkbox" name="exit_intent" defaultChecked={f?.exit_intent} className="checkbox" />Show as popup when a visitor is about to leave</label>
      <Field label="Popup delay (seconds)"><input name="popup_delay_seconds" type="number" placeholder="Delay in seconds" defaultValue={f?.popup_delay_seconds ?? 0} className="input" /></Field>
      <button className="btn btn-primary col-span-2 justify-self-start">Save form</button>
    </form>
  );
}
