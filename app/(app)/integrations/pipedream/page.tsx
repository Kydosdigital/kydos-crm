import Link from "next/link";
import { ArrowLeft, ArrowRight, Plug, ShieldCheck, Search, ExternalLink } from "lucide-react";
import { Alert, Badge, Card, Page, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/workspace";
import {
  listWorkspacePipedreamAccounts, pipedreamConfigured, pipedreamCatalogConfigured,
  searchPipedreamApps, type PipedreamApp,
} from "@/lib/pipedream-connect";
import { startPipedreamConnection } from "./actions";

export const dynamic = "force-dynamic";

/** Examples only until a Pipedream OAuth client is configured. */
const EXAMPLES: PipedreamApp[] = [
  { slug: "google_sheets", name: "Google Sheets", description: "Spreadsheets and contact data", category: "Data" },
  { slug: "gmail", name: "Gmail", description: "Email account connection", category: "Communication" },
  { slug: "google_calendar", name: "Google Calendar", description: "Appointments and events", category: "Scheduling" },
  { slug: "slack", name: "Slack", description: "Team notifications", category: "Communication" },
  { slug: "notion", name: "Notion", description: "Documents and databases", category: "Productivity" },
  { slug: "airtable", name: "Airtable", description: "Tables and operational data", category: "Data" },
  { slug: "hubspot", name: "HubSpot", description: "CRM and contact management", category: "Sales" },
  { slug: "stripe", name: "Stripe", description: "Payment account connection", category: "Finance" },
  { slug: "trello", name: "Trello", description: "Boards and tasks", category: "Productivity" },
  { slug: "github", name: "GitHub", description: "Developer workflows", category: "Development" },
  { slug: "zoom", name: "Zoom", description: "Video meetings", category: "Scheduling" },
  { slug: "typeform", name: "Typeform", description: "Form responses", category: "Lead capture" },
];

const ERRORS: Record<string, string> = {
  "invalid-app": "Please choose an application from the catalogue.",
  "not-configured": "Pipedream Connect has not yet been enabled by an administrator.",
  "connection-unavailable": "Unable to start the connection. Please try again later.",
};

export default async function PipedreamIntegrations({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; q?: string; after?: string }>;
}) {
  const { ws } = await requireAdmin();
  const { error, q, after } = await searchParams;
  const search = typeof q === "string" ? q.trim().slice(0, 80) : "";
  const isReady = pipedreamConfigured();
  const catalogReady = pipedreamCatalogConfigured();
  let apps: PipedreamApp[] = EXAMPLES.filter(
    (item) => !search || (item.name + " " + item.description).toLowerCase().includes(search.toLowerCase()),
  );
  let nextCursor: string | null = null;
  let total = apps.length;
  let catalogError = false;
  let accounts: Awaited<ReturnType<typeof listWorkspacePipedreamAccounts>> = [];
  let accountsError = false;

  if (catalogReady) {
    try {
      const result = await searchPipedreamApps(search, typeof after === "string" ? after : "");
      apps = result.apps;
      total = result.total;
      nextCursor = result.nextCursor;
    } catch {
      catalogError = true;
      apps = [];
      total = 0;
    }
  }
  if (isReady) {
    try {
      accounts = await listWorkspacePipedreamAccounts(ws.id);
    } catch {
      accountsError = true;
    }
  }

  return (
    <Page>
      <PageHeader
        title="App marketplace"
        description={"Explore and connect tools for " + ws.name + ". Powered by Pipedream Connect."}
        actions={<Link href="/integrations" className="btn btn-secondary"><ArrowLeft aria-hidden /> All integrations</Link>}
        meta={<Badge tone={isReady && !accountsError ? "success" : "neutral"}>
          {isReady && !accountsError ? "Development connections enabled" : "Preview mode"}
        </Badge>}
      />
      <Alert tone="warning">
        <ShieldCheck aria-hidden /> Free Pipedream Connect is for development and testing only,
        with up to 10 external test users. Real customer connections require a paid production plan.
        Connecting an app does not automatically activate workflows, send messages or import records.
      </Alert>
      {!catalogReady && <Alert tone="neutral">
        Showing sample apps. To browse the full catalogue, configure Pipedream OAuth credentials
        in the protected staging environment. Connection buttons stay disabled until approved.
      </Alert>}
      {catalogReady && !isReady && <Alert tone="neutral">
        Live catalogue browsing is available, but connections are disabled by the release flag.
      </Alert>}
      {catalogError && <Alert tone="danger">
        The live app catalogue could not be loaded. No connections were started.
      </Alert>}
      {accountsError && <Alert tone="danger">
        Unable to read account status. No account credentials were exposed.
      </Alert>}
      {error && ERRORS[error] && <Alert tone="danger">{ERRORS[error]}</Alert>}

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-ink">Find an integration</h2>
        <form method="GET" className="flex flex-wrap gap-2">
          <label className="flex min-w-[200px] flex-1 flex-col gap-1.5">
            <span className="text-xs text-muted">Search applications</span>
            <input name="q" className="input" maxLength={80} defaultValue={search}
              placeholder="e.g. Google, accounting, CRM..." />
          </label>
          <button type="submit" className="btn btn-secondary self-end"><Search className="h-4 w-4" aria-hidden /> Search</button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {["Calendar", "Email", "Sheets", "Marketing", "Accounting", "Forms"].map((category) => (
            <Link key={category} className="text-xs text-brand-text underline" href={"/integrations/pipedream?q=" + encodeURIComponent(category)}>{category}</Link>
          ))}
        </div>
      </Card>

      <div className="mt-7">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-ink">{catalogReady ? "Pipedream app catalogue" : "Popular app examples"}</h2>
          <p className="text-xs text-muted">
            {catalogReady ? total.toLocaleString("en-GB") + " matches" : "Sample of 3,000+ available connectors"}
          </p>
        </div>
        {apps.length === 0 && <Card><p className="text-sm text-muted">No matching apps on this page.</p></Card>}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {apps.map((app) => (
            <Card key={app.slug}>
              <div className="flex items-start gap-3">
                <span className="rounded-lg bg-subtle p-2 text-muted"><Plug className="h-5 w-5" aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{app.name}</p>
                  <p className="mt-0.5 text-xs text-muted">{app.category}</p>
                </div>
              </div>
              <p className="mt-3 min-h-[36px] text-xs leading-relaxed text-muted">{app.description || "Connect your account to Kydos CRM."}</p>
              <form action={startPipedreamConnection} className="mt-4">
                <input type="hidden" name="app" value={app.slug} />
                <button type="submit" disabled={!isReady || accountsError} className="btn btn-secondary w-full justify-between">
                  <span>{isReady ? "Connect account" : "Development only"}</span>
                  <ExternalLink className="h-4 w-4" aria-hidden />
                </button>
              </form>
            </Card>
          ))}
        </div>
        {catalogReady && nextCursor && !catalogError && (
          <div className="mt-4 flex justify-end">
            <Link className="btn btn-secondary"
              href={"/integrations/pipedream?" + new URLSearchParams({ ...(search ? { q: search } : {}), after: nextCursor })}>
              More apps <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        )}
      </div>

      <div className="mt-8">
        <h2 className="mb-3 font-semibold text-ink">Connected accounts in this workspace</h2>
        {!isReady && <Card><p className="text-sm text-muted">
          Pipedream connections are switched off pending testing and approval.
        </p></Card>}
        {isReady && !accountsError && accounts.length === 0 &&
          <Card><p className="text-sm text-muted">No accounts connected in this workspace yet.</p></Card>}
        <div className="grid gap-3 md:grid-cols-2">
          {accounts.map((account) => (
            <Card key={account.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
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
