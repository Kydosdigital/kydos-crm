import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { deleteSnippet, saveSnippet } from "../../actions";
import { Plus, TextQuote } from "lucide-react";
import { Card, CardTitle, EmptyState, Field, Page, PageHeader } from "@/components/ui";

export default async function Snippets() {
  const { ws } = await requireWorkspace();
  const { data } = await (await supabaseServer()).from("snippets").select("*").eq("workspace_id", ws.id).order("name");
  return (
    <Page>
      <PageHeader title="Text snippets" description="Reusable replies for WhatsApp, SMS and email. They appear as one-click links under the message box on every contact." />
      <div className="grid grid-cols-[minmax(0,1fr)_380px] items-start gap-6">
        <div className="flex flex-col gap-3">
          {(data ?? []).length === 0 && <div className="card"><EmptyState icon={TextQuote} title="No snippets yet">Save a reply you type often, such as your pricing or opening hours.</EmptyState></div>}
          {(data ?? []).map((x) => (
            <div key={x.id} className="card p-5 text-[13px]"><div className="flex items-center justify-between gap-3"><b className="text-sm font-semibold text-ink">{x.name}</b><form action={deleteSnippet}><input type="hidden" name="id" value={x.id} /><button className="btn btn-danger btn-sm">Delete</button></form></div><p className="mt-2 whitespace-pre-wrap leading-relaxed text-ink-2">{x.body}</p></div>
          ))}
        </div>
        <Card className="sticky top-7">
          <CardTitle icon={Plus}>New snippet</CardTitle>
          <form action={saveSnippet} className="flex flex-col gap-3">
            <Field label="Name"><input name="name" required placeholder="Name, e.g. Pricing reply" className="input" /></Field>
            <Field label="Text"><textarea name="body" required rows={5} placeholder="Text. You can use first_name in double curly braces." className="textarea" /></Field>
            <button className="btn btn-primary">Save snippet</button>
          </form>
        </Card>
      </div>
    </Page>
  );
}
