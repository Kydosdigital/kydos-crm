import { requireAdmin } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { addTrackingNumber, removeTrackingNumber } from "../../actions";
import { PhoneCall, Plus } from "lucide-react";
import { Alert, Card, CardTitle, EmptyState, Field, Page, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CallTracking({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { ws } = await requireAdmin();
  const db = await supabaseServer();
  const since = new Date(new Date().getTime() - 30 * 86400000).toISOString();
  const [{ data: nums }, { data: calls }] = await Promise.all([
    db.from("tracking_numbers").select("*").eq("workspace_id", ws.id).order("created_at"),
    db.from("call_logs").select("tracking_label,status").eq("workspace_id", ws.id).eq("direction", "in").gte("created_at", since),
  ]);
  const stat = (label: string) => {
    const c = (calls ?? []).filter((x) => x.tracking_label === label);
    return { total: c.length, missed: c.filter((x) => x.status === "missed").length };
  };
  const app = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return (
    <Page>
      <PageHeader title="Call tracking" description="Give each ad, flyer or web page its own phone number. Callers are tagged with the source, so you can see which campaign made the phone ring." />
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-3">
          {(nums ?? []).length === 0 && <div className="card"><EmptyState icon={PhoneCall} title="No tracking numbers yet">Buy another number in Twilio, point its voice webhook at the address on the right, then add it here.</EmptyState></div>}
          {(nums ?? []).map((n) => {
            const st = stat(n.label);
            return (
              <div key={n.id} className="card flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-ink">{n.label}</div>
                  <div className="text-sm text-muted">{n.number}</div>
                  <div className="mt-1 text-xs text-muted">Tags callers: {[n.utm_source, n.utm_medium, n.utm_campaign].filter(Boolean).join(" / ") || "no tags"}</div>
                  <div className="mt-2 text-sm">Last 30 days: <strong>{st.total}</strong> calls, <strong>{st.missed}</strong> missed</div>
                </div>
                <form action={removeTrackingNumber}><input type="hidden" name="id" value={n.id} /><button className="btn btn-danger btn-sm" data-confirm="Remove this tracking number? Calls to it will stop being answered here.">Remove</button></form>
              </div>
            );
          })}
        </div>
        <Card>
          <CardTitle>Add a tracking number</CardTitle>
          <form action={addTrackingNumber} className="mt-3 flex flex-col gap-3">
            <Field label="Label"><input name="label" required placeholder="e.g. Google Ads, spring flyer" className="input" /></Field>
            <Field label="Twilio number"><input name="number" required placeholder="+447..." className="input" /></Field>
            <Field label="Source"><input name="utm_source" placeholder="e.g. google" className="input" /></Field>
            <Field label="Medium"><input name="utm_medium" placeholder="e.g. cpc, print" className="input" /></Field>
            <Field label="Campaign"><input name="utm_campaign" placeholder="e.g. spring-offer" className="input" /></Field>
            <button className="btn btn-primary self-start"><Plus aria-hidden />Add number</button>
          </form>
          <p className="mt-3 text-xs text-muted">In Twilio, set the number&apos;s voice webhook (POST) to <code>{app}/api/webhooks/twilio-voice</code>. Calls ring your forwarding number from Settings.</p>
        </Card>
      </div>
    </Page>
  );
}
