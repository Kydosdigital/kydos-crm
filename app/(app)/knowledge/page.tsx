import { requireStaff } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { deleteKnowledge, saveKnowledge, toggleKnowledge } from "../../actions";
import { BookOpen, Plus } from "lucide-react";
import { Badge, Card, CardTitle, EmptyState, Field, Page, PageHeader, humanise } from "@/components/ui";

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
  const { ws } = await requireStaff();
  const { data } = await (await supabaseServer()).from("knowledge_items").select("*").eq("workspace_id", ws.id).order("kind").order("title");
  const TONE: Record<string, "brand" | "info" | "success" | "warning" | "violet" | "danger" | "neutral"> = { service: "brand", offer_ladder: "info", case_study: "success", objection: "warning", faq: "neutral", tone: "violet", rule: "danger" };
  return (
    <Page>
      <PageHeader title="Knowledge base" description={<>What the communications agent knows about {ws.name}. It only uses active items and never invents services, prices or results beyond what is written here. Use the MCP connection to bulk-add items from chat.</>} />
      <div className="grid grid-cols-[minmax(0,1fr)_380px] items-start gap-6">
        <div>
          {(data ?? []).length === 0 && <div className="card"><EmptyState icon={BookOpen} title="Nothing here yet">Add your services, proof points and tone of voice so the agent writes like you.</EmptyState></div>}
          {(data ?? []).length > 0 && (
            <div className="card divide-y divide-line">
              {(data ?? []).map((k) => (
                <details key={k.id} className={`disclosure px-5 py-3.5 text-[13px] ${k.active ? "" : "opacity-50"}`}>
                  <summary><Badge tone={TONE[k.kind] ?? "neutral"}>{humanise(k.kind)}</Badge><b className="font-semibold text-ink">{k.title}</b>{!k.active && <Badge className="ml-auto">Disabled</Badge>}</summary>
                  <form action={saveKnowledge} className="mt-4 flex flex-col gap-2.5 pl-6">
                    <input type="hidden" name="id" value={k.id} />
                    <select name="kind" defaultValue={k.kind} aria-label="Kind" className="select">{kinds.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                    <input name="title" defaultValue={k.title} aria-label="Title" className="input" />
                    <textarea name="body" rows={6} defaultValue={k.body} aria-label="Details" className="textarea" />
                    <button className="btn btn-primary btn-sm self-start">Save</button>
                  </form>
                  <div className="mt-2 flex gap-1 pb-1 pl-6">
                    <form action={toggleKnowledge}><input type="hidden" name="id" value={k.id} /><input type="hidden" name="active" value={String(!k.active)} /><button className="btn btn-ghost btn-sm">{k.active ? "Disable" : "Enable"}</button></form>
                    <form action={deleteKnowledge}><input type="hidden" name="id" value={k.id} /><button className="btn btn-danger btn-sm">Delete</button></form>
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
        <Card className="sticky top-7">
          <CardTitle icon={Plus}>Add item</CardTitle>
          <form action={saveKnowledge} className="flex flex-col gap-3">
            <Field label="Kind"><select name="kind" className="select">{kinds.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Field label="Title"><input name="title" placeholder="Title, e.g. Local SEO package" required className="input" /></Field>
            <Field label="Details"><textarea name="body" rows={6} placeholder="Details the agent can rely on" required className="textarea" /></Field>
            <button className="btn btn-primary">Add</button>
          </form>
        </Card>
      </div>
    </Page>
  );
}
