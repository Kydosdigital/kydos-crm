import Link from "next/link";
import { ClipboardCheck, MailCheck, ShieldCheck } from "lucide-react";
import { requireStaff } from "@/lib/workspace";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Alert, Badge, Card, Page, PageHeader } from "@/components/ui";
import { prepareCampaignAudience, cancelCampaignAudience } from "./actions";

export const dynamic = "force-dynamic";

export default async function CampaignQueuePreview({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const { error, done } = await searchParams;
  const { ws } = await requireStaff();
  const db = supabaseAdmin();
  const { data: batches, error: readError } = await db.from("campaign_batches")
    .select("id,workspace_id,source_tag,channel,status,selected_count,queued_count,excluded_count,created_at")
    .eq("workspace_id", ws.id)
    .order("created_at", { ascending: false })
    .limit(40);

  return (
    <Page>
      <PageHeader
        title="Campaign audience previews"
        description={"Prepare a complete email recipient snapshot for " + ws.name + ", without sending anything."}
        actions={<Link href="/broadcast" className="btn btn-secondary">Back to campaigns</Link>}
      />
      <Alert tone="warning">
        <ShieldCheck aria-hidden /> This is a preparation-only workflow. Preparing or cancelling an audience never sends an email,
        schedules a campaign, or triggers a payment. Delivery will be enabled only after its separate release tests pass.
      </Alert>
      {error && <Alert tone="danger">{error}</Alert>}
      {done && <Alert tone="success">{done}</Alert>}
      {readError && <Alert tone="danger">Unable to load audience history. Please try again.</Alert>}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-ink">Prepare a tagged email audience</h2>
          <p className="mb-4 text-[13px] text-muted">
            Select one existing contact tag. All matching contacts are checked in a single database snapshot,
            including opt-outs, invalid addresses and duplicate destinations. No recipients will be contacted.
          </p>
          <form action={prepareCampaignAudience} className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[220px] flex-1 flex-col gap-1.5">
              <span className="text-xs font-medium text-ink">Contact tag</span>
              <input
                name="tag"
                className="input"
                type="text"
                minLength={1}
                maxLength={100}
                placeholder="e.g. november-leads"
                required
              />
            </label>
            <button className="btn btn-primary" type="submit">
              <ClipboardCheck className="h-4 w-4" aria-hidden /> Prepare preview, do not send
            </button>
          </form>
        </Card>
        <Card>
          <MailCheck className="mb-3 h-6 w-6 text-brand-text" aria-hidden />
          <h2 className="text-sm font-semibold text-ink">What these figures mean</h2>
          <p className="mt-2 text-[13px] text-muted">
            <b>Selected</b> is every contact with the tag. <b>Queued</b> is the number eligible in the saved
            recipient snapshot. <b>Excluded</b> includes missing or invalid emails, opt-outs and duplicates.
          </p>
          <p className="mt-3 text-[13px] text-muted">
            Queued does not mean sent. Current consent and suppression must be checked again before any
            future delivery. The sender integration is not yet available.
          </p>
        </Card>
      </div>

      <div className="mt-7">
        <h2 className="mb-3 text-sm font-semibold text-ink">Recent prepared audiences</h2>
        {!readError && (batches ?? []).length === 0 && (
          <Card><p className="text-[13px] text-muted">No campaign audience previews have been created in this workspace yet.</p></Card>
        )}
        <div className="space-y-3">
          {(batches ?? []).map((batch) => (
            <Card key={batch.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-ink">{batch.source_tag}</h3>
                  <p className="mt-1 text-xs text-muted">
                    Email audience, prepared {new Date(batch.created_at).toLocaleString("en-GB", {
                      timeZone: "Europe/London", day: "numeric", month: "short",
                      year: "numeric", hour: "2-digit", minute: "2-digit",
                    })}
                  </p>
                </div>
                <Badge tone={batch.status === "prepared" ? "success" : "outline"}>{batch.status}</Badge>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3">
                <div><p className="text-xs text-muted">Selected</p><p className="text-lg font-semibold">{batch.selected_count}</p></div>
                <div><p className="text-xs text-muted">Queued (not sent)</p><p className="text-lg font-semibold">{batch.queued_count}</p></div>
                <div><p className="text-xs text-muted">Excluded</p><p className="text-lg font-semibold">{batch.excluded_count}</p></div>
              </div>
              {batch.status === "prepared" && (
                <form action={cancelCampaignAudience} className="mt-3 flex justify-end border-t border-line pt-3">
                  <input type="hidden" name="batch_id" value={batch.id} />
                  <button className="btn btn-secondary btn-sm" type="submit">Cancel this preview</button>
                </form>
              )}
            </Card>
          ))}
        </div>
        {(batches ?? []).length === 40 && <p className="mt-3 text-xs text-muted">Showing the latest 40 audience previews.</p>}
      </div>
    </Page>
  );
}
