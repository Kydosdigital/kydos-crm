/**
 * Pipedream Connect server-side adapter for the existing production project.
 * Keep OAuth client credentials here on the server, never in NEXT_PUBLIC_ vars.
 * The feature is explicitly disabled until production credentials are added.
 * Connect accounts are scoped to a CRM workspace, not to a user-supplied ID.
 */
import "server-only";

const PROJECT_ID = "proj_vosZn53";
const API = "https://api.pipedream.com";
const OAUTH_SCOPES = "connect:tokens:create connect:accounts:read";
const CONNECT_SCOPES = "connect:accounts:read connect:accounts:write";
const REVIEWED_APPS = new Set(["google_sheets", "gmail", "notion", "github"]);

export type ConnectedPipedreamAccount = {
  id: string;
  name: string;
  appName: string;
  appSlug: string;
  healthy: boolean;
  dead: boolean;
};

export function pipedreamConfigured(): boolean {
  const env = process.env.PIPEDREAM_ENVIRONMENT;
  // Fail closed if the Vercel deployment target and Pipedream environment differ.
  // A preview must never create or list real production connected accounts.
  if (process.env.VERCEL_ENV === "production" && env !== "production") return false;
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production" && env !== "development") return false;
  return process.env.PIPEDREAM_CONNECT_ENABLED === "true"
    && process.env.PIPEDREAM_PROJECT_ID === PROJECT_ID
    && (env === "production" || env === "development")
    && Boolean(process.env.PIPEDREAM_CLIENT_ID && process.env.PIPEDREAM_CLIENT_SECRET);
}

function config() {
  if (!pipedreamConfigured()) throw new Error("Pipedream Connect is not configured");
  return {
    projectId: PROJECT_ID,
    environment: process.env.PIPEDREAM_ENVIRONMENT as "production" | "development",
    clientId: process.env.PIPEDREAM_CLIENT_ID!,
    clientSecret: process.env.PIPEDREAM_CLIENT_SECRET!,
  };
}

export function workspaceExternalUserId(workspaceId: string): string {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(workspaceId))
    throw new Error("Invalid workspace identifier");
  return "kydos_ws_" + workspaceId.toLowerCase();
}

export function validPipedreamAppSlug(slug: string): boolean {
  // The browser is untrusted. Only explicitly reviewed apps may be authorised.
  return REVIEWED_APPS.has(slug);
}

async function accessToken(): Promise<{ token: string; environment: string }> {
  const c = config();
  const res = await fetch(API + "/v1/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: c.clientId,
      client_secret: c.clientSecret,
      scope: OAUTH_SCOPES,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error("Pipedream authentication failed");
  const body = await res.json() as { access_token?: unknown };
  if (typeof body.access_token !== "string" || !body.access_token)
    throw new Error("Pipedream authentication returned no token");
  return { token: body.access_token, environment: c.environment };
}

async function connectRequest(path: string, method: "GET" | "POST", data?: object): Promise<unknown> {
  const { token, environment } = await accessToken();
  const res = await fetch(API + "/v1/connect/" + PROJECT_ID + path, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      "X-PD-Environment": environment,
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error("Pipedream request failed");
  return res.json();
}

/** Returns non-secret account metadata only, no credentials or access tokens. */
export async function listWorkspacePipedreamAccounts(workspaceId: string): Promise<ConnectedPipedreamAccount[]> {
  const id = workspaceExternalUserId(workspaceId);
  const data = await connectRequest("/users/" + encodeURIComponent(id) + "/accounts", "GET");
  if (!Array.isArray(data)) throw new Error("Unexpected Pipedream account response");
  return data.slice(0, 100).flatMap((item: unknown) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const app = row.app && typeof row.app === "object" ? row.app as Record<string, unknown> : {};
    if (typeof row.id !== "string") return [];
    return [{
      id: row.id,
      name: typeof row.name === "string" ? row.name.slice(0, 160) : "Connected account",
      appName: typeof app.name === "string" ? app.name.slice(0, 80) : "App",
      appSlug: typeof app.name_slug === "string" ? app.name_slug : "",
      healthy: row.healthy === true,
      dead: row.dead === true,
    }];
  });
}

/** Token/link is transient; never persist or log either value. */
export async function createWorkspacePipedreamLink(workspaceId: string, appSlug: string): Promise<string> {
  if (!validPipedreamAppSlug(appSlug)) throw new Error("Invalid app selection");
  const data = await connectRequest("/tokens", "POST", {
    external_user_id: workspaceExternalUserId(workspaceId),
    expires_in: 600,
    scope: CONNECT_SCOPES,
  }) as { connect_link_url?: unknown };
  if (typeof data.connect_link_url !== "string") throw new Error("Pipedream did not provide a Connect Link");
  const link = new URL(data.connect_link_url);
  if (link.origin !== "https://pipedream.com" || link.pathname !== "/_static/connect.html")
    throw new Error("Pipedream returned an unexpected connection URL");
  link.searchParams.set("app", appSlug);
  return link.toString();
}
