import { requireStaff } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { deleteTemplate, saveTemplate } from "../../actions";
import { LayoutTemplate, Plus } from "lucide-react";
import { Card, CardTitle, EmptyState, Field, Page, PageHeader } from "@/components/ui";

export default async function Templates() {
  const { ws } = await requireStaff();
  const { data } = await (await supabaseServer()).from("email_templates").select("*").eq("workspace_id", ws.id).order("name");
  return (
    <Page>
      <PageHeader title="Email templates" description="Open a contact and pick a template to fill the message box." />
      <div className="grid grid-cols-[minmax(0,1fr)_380px] items-start gap-6">
        <div className="flex flex-col gap-3">
          {(data ?? []).length === 0 && <div className="card"><EmptyState icon={LayoutTemplate} title="No templates yet">Save the emails you send most often so they are one click away on every contact.</EmptyState></div>}
          {(data ?? []).map((t) => (
            <div key={t.id} className="card p-5 text-[13px]">
              <div className="flex items-start justify-between gap-3"><div><b className="text-sm font-semibold text-ink">{t.name}</b>
                <div className="mt-0.5 text-muted">Subject: <span className="text-ink-2">{t.subject}</span></div></div>
                <form action={deleteTemplate}><input type="hidden" name="id" value={t.id} /><button className="btn btn-danger btn-sm">Delete</button></form></div>
              <pre className="well mt-3 whitespace-pre-wrap px-4 py-3 font-sans leading-relaxed text-ink-2">{t.body}</pre>
            </div>
          ))}
        </div>
        <Card className="sticky top-7">
          <CardTitle icon={Plus}>New template</CardTitle>
          <form action={saveTemplate} className="flex flex-col gap-3">
            <Field label="Name"><input name="name" placeholder="Template name" required className="input" /></Field>
            <Field label="Subject"><input name="subject" placeholder="Subject" required className="input" /></Field>
            <Field label="Body"><textarea name="body" rows={8} placeholder="Body. Use {{first_name}}." required className="textarea" /></Field>
            <button className="btn btn-primary">Save template</button>
          </form>
        </Card>
      </div>
    </Page>
  );
}
