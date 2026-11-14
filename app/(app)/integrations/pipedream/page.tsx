import Link from "next/link";
import { Plug, ShieldCheck, ArrowLeft, ExternalLink } from "lucide-react";
import { Alert, Badge, Card, Page, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/workspace";
import { listWorkspacePipedreamAccounts, pipedreamConfigured } from "@/lib/pipedream-connect";
import { startPipedreamConnection } from "./actions";

export const dynamic = "force-dynamic";

const APPS = [
  { slug: "google_sheets", name: "Google Sheets" },
  { slug: "gmail", name: "Gmail" },
  { slug: "notion", name: "Notion" },
  { slug: "github", name: "GitHub" },
] as const;

const errors: Record<string, string> = {
  "invalid-app": "Choose a valid application.",
  "not-configured": "Pipedream Connect has not yet been enabled by an administrator.",
  "connection-unavailable": "Unable to start the connection. Please try again later.",
};

export default async function PipedreamIntegrations({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { ws } = await requireAdmin();
  const { error } = await searchParams;
  const ready = pipedreamConfigured();
  let accounts: Awaited<ReturnType<typeof listWorkspacePipedreamAccounts>> = [];
  let readError = false;
  if (ready) {
    try {
      accounts = await listWorkspacePipedreamAccounts(ws.id);
    } catch {
      readError = true;
    }
  }

  return (
    <Page>
      <PageHeader title="Pipedream Connect"
        description={"Connect apps to " + ws.name + " without sharing your account credentials with Kydos CRM."}
        actions={<Link href="/integrations" className="btn btn-secondary"><ArrowLeft aria-hidden /> All integrations</Link>}
        meta={<Badge tone={ready && !readError ? "success" : "neutral"}>
          {ready && !readError ? "Configured" : "Setup required"}
        </Badge>}
      />
      <Alert tone="warning">
        <ShieldCheck aria-hidden /> Only owners and admins can connect accounts.
        Connections belong to the selected CRM workspace and do not enable automatic syncing, messaging or payments.
      </Alert>
      {!ready && <Alert tone="danger">Pipedream Connect is not active. Configure the production OAuth client,
        project ID and environment in protected Vercel settings before enabling it.</Alert>}
      {readError && <Alert tone="danger">We could not verify connected accounts. No credentials were exposed.</Alert>}
      {error && errors[error] && <Alert tone="danger">{errors[error]}</Alert>}

      <Card>
        <h2 className="mb-1 font-semibold text-ink">Connect another app</h2>
        <p className="mb-4 text-sm text-muted">
          Choose an app, then authorise it on Pipedream&apos;s hosted connection page.
          Your connection link is short-lived. Return here and refresh to see it listed.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {APPS.map((app) => (
            <form action={startPipedreamConnection} key={app.slug}>
              <input type="hidden" name="app" value={app.slug} />
              <button type="submit" disabled={!ready || readError} className="btn btn-secondary w-full justify-between">
                <span><Plug className="mr-2 inline h-4 w-4" aria-hidden />{app.name}</span>
                <ExternalLink className="h-4 w-4" aria-hidden />
              </button>
            </form>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted">
          More apps can be enabled after their permissions and data flows are reviewed.
        </p>
      </Card>

      <div className="mt-6">
        <h2 className="mb-3 font-semibold text-ink">Connected accounts for this workspace</h2>
        {ready && !readError && accounts.length === 0 &&
          <Card><p className="text-sm text-muted">No connected accounts yet.</p></Card>}
        <div className="grid gap-3 md:grid-cols-2">
          {accounts.map((account) => (
            <Card key={account.id}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink">{account.appName}</p>
                  <p className="mt-1 break-words text-sm text-muted">{account.name}</p>
                </div>
                <Badge tone={account.dead || !account.healthy ? "danger" : "success"}>
                  {account.dead ? "Disconnected" : account.healthy ? "Connected" : "Needs attention"}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </Page>
  );
}
