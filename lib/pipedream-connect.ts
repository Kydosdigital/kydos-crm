/**
 * Pipedream Connect managed-auth and app discovery integration.
 * Server-only, no user-submitted tenant IDs, tokens or credential disclosure.
 *
 * Production Connect is explicitly disabled until the paid plan and release
 * have been approved. Free development uses the SAME project ID but the
 * separate Pipedream development environment.
 */
import "server-only";

const PROJECT_ID = "proj_vosZn53";
const API = "https://api.pipedream.com";
const PROD_VERCEL_PROJECT = "prj_8mgLeALLLnunYNYOmLgsrS1K5Zmv";
const STAGING_VERCEL_PROJECT = "prj_CIFg9KiNF8kK5vR518NpNzY0AvXJ";
const OAUTH_SCOPES = "connect:tokens:create connect:accounts:read connect:apps:*";
const CONNECT_SCOPES = "connect:accounts:read connect:accounts:write";

export type PipedreamApp = {
  slug: string;
  name: string;
  description: string;
  category: string;
};
export type PipedreamCatalog = {
  apps: PipedreamApp[];
  total: number;
  nextCursor: string | null;
};
export type ConnectedPipedreamAccount = {
  id: string;
  name: string;
  appName: string;
  appSlug: string;
  healthy: boolean;
  dead: boolean;
};

function environmentAllowed(): boolean {
  if (process.env.PIPEDREAM_PROJECT_ID !== PROJECT_ID) return false;
  const env = process.env.PIPEDREAM_ENVIRONMENT;
  if (env !== "development" && env !== "production") return false;
  const vercelId = process.env.VERCEL_PROJECT_ID;
  if (vercelId === PROD_VERCEL_PROJECT && env !== "production") return false;
  if (vercelId === STAGING_VERCEL_PROJECT && env !== "development") return false;
  if (env === "production" && process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production")
    return false;
  return true;
}

/** Allow catalogue browsing with protected credentials while Connect is disabled. */
export function pipedreamCatalogConfigured(): boolean {
  return environmentAllowed() &&
    Boolean(process.env.PIPEDREAM_CLIENT_ID && process.env.PIPEDREAM_CLIENT_SECRET);
}

/** Fail closed, especially for an accidental production flag activation. */
export function pipedreamConfigured(): boolean {
  return pipedreamCatalogConfigured() &&
    process.env.PIPEDREAM_CONNECT_ENABLED === "true" &&
    (process.env.PIPEDREAM_ENVIRONMENT === "development" ||
      process.env.PIPEDREAM_PRODUCTION_APPROVED === "true");
}

function credentials() {
  if (!pipedreamCatalogConfigured()) throw new Error("Pipedream catalogue not configured");
  return {
    environment: process.env.PIPEDREAM_ENVIRONMENT as "development" | "production",
    clientId: process.env.PIPEDREAM_CLIENT_ID!,
    clientSecret: process.env.PIPEDREAM_CLIENT_SECRET!,
  };
}

/** Exactly one CRM tenant maps to one Connect external user per environment. */
export function workspaceExternalUserId(workspaceId: string): string {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(workspaceId))
    throw new Error("Invalid workspace identifier");
  return "kydos_ws_" + workspaceId.toLowerCase();
}

export function validPipedreamAppSlug(slug: string): boolean {
  return /^[a-z][a-z0-9_-]{0,95}$/.test(slug);
}

async function accessToken(): Promise<{ token: string; environment: "development" | "production" }> {
  const c = credentials();
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
  const response = await res.json() as { access_token?: unknown };
  if (typeof response.access_token !== "string" || !response.access_token)
    throw new Error("Pipedream did not return an OAuth access token");
  return { token: response.access_token, environment: c.environment };
}

/** Every request path is server-constructed, not an input URL. */
async function request(path: string, method: "GET" | "POST", data?: object): Promise<unknown> {
  const { token, environment } = await accessToken();
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      "x-pd-environment": environment,
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error("Pipedream request failed");
  return res.json();
}

type RemoteApp = {
  name_slug?: unknown;
  name?: unknown;
  description?: unknown;
  categories?: unknown;
};

function normaliseApp(raw: RemoteApp): PipedreamApp | null {
  if (typeof raw?.name_slug !== "string" || !validPipedreamAppSlug(raw.name_slug))
    return null;
  const cats = Array.isArray(raw.categories) ? raw.categories.filter(
    (c): c is string => typeof c === "string",
  ) : [];
  return {
    slug: raw.name_slug,
    name: typeof raw.name === "string" ? raw.name.slice(0, 100) : raw.name_slug,
    description: typeof raw.description === "string" ? raw.description.slice(0, 200) : "",
    category: cats[0]?.slice(0, 80) ?? "Integration",
  };
}

function safeCursor(input: string): string | null {
  return /^[A-Za-z0-9_+\/=.:~-]{1,300}$/.test(input) ? input : null;
}

/** Search the full Pipedream catalogue, a server-paginated 24-app window. */
export async function searchPipedreamApps(q: string, cursor = ""): Promise<PipedreamCatalog> {
  if (!pipedreamCatalogConfigured()) throw new Error("Pipedream catalogue not configured");
  const search = q.trim().slice(0, 80);
  const params = new URLSearchParams({
    limit: "24", sort_key: "featured_weight", sort_direction: "desc",
  });
  if (search) params.set("q", search);
  if (cursor) {
    const safe = safeCursor(cursor);
    if (!safe) throw new Error("Invalid page cursor");
    params.set("after", safe);
  }
  const result = await request("/v1/connect/apps?" + params, "GET") as {
    data?: unknown; page_info?: { total_count?: unknown; end_cursor?: unknown; count?: unknown };
  };
  if (!Array.isArray(result.data)) throw new Error("Invalid Pipedream catalogue response");
  const apps = result.data.slice(0, 24).flatMap((x: unknown) => {
    const value = x && typeof x === "object" ? normaliseApp(x as RemoteApp) : null;
    return value ? [value] : [];
  });
  const total = typeof result.page_info?.total_count === "number" ? result.page_info.total_count : apps.length;
  const end = typeof result.page_info?.end_cursor === "string"
    ? safeCursor(result.page_info.end_cursor) : null;
  return { apps, total, nextCursor: end && apps.length && total > apps.length ? end : null };
}

/** Never trust an app slug from a submitted form, check Pipedream registry. */
async function confirmApp(slug: string): Promise<void> {
  if (!validPipedreamAppSlug(slug)) throw new Error("Invalid app slug");
  const response = await request("/v1/connect/apps/" + encodeURIComponent(slug), "GET") as {
    data?: RemoteApp;
  };
  if (response.data?.name_slug !== slug) throw new Error("App is not in Pipedream catalogue");
}

/** Workspace-scoped account metadata, with credentials explicitly excluded. */
export async function listWorkspacePipedreamAccounts(wsId: string): Promise<ConnectedPipedreamAccount[]> {
  if (!pipedreamConfigured()) return [];
  const q = new URLSearchParams({
    external_user_id: workspaceExternalUserId(wsId),
    include_credentials: "false",
    limit: "100",
  });
  const result = await request("/v1/connect/" + PROJECT_ID + "/accounts?" + q, "GET") as {
    data?: unknown;
  };
  if (!Array.isArray(result.data)) throw new Error("Invalid Pipedream accounts response");
  return result.data.slice(0, 100).flatMap((raw: unknown) => {
    if (!raw || typeof raw !== "object") return [];
    const r = raw as Record<string, unknown>;
    const app = r.app && typeof r.app === "object" ? r.app as Record<string, unknown> : {};
    if (typeof r.id !== "string") return [];
    return [{
      id: r.id,
      name: typeof r.name === "string" ? r.name.slice(0, 160) : "Connected account",
      appName: typeof app.name === "string" ? app.name.slice(0, 100) : "App",
      appSlug: typeof app.name_slug === "string" ? app.name_slug : "",
      healthy: r.healthy === true,
      dead: r.dead === true,
    }];
  });
}

/** Transient hosted account connection, never persist/log token or link. */
export async function createWorkspacePipedreamLink(wsId: string, appSlug: string): Promise<string> {
  if (!pipedreamConfigured()) throw new Error("Pipedream Connect disabled");
  if (!validPipedreamAppSlug(appSlug)) throw new Error("Invalid app slug");
  await confirmApp(appSlug);
  const response = await request("/v1/connect/" + PROJECT_ID + "/tokens", "POST", {
    external_user_id: workspaceExternalUserId(wsId),
    expires_in: 600,
    scope: CONNECT_SCOPES,
  }) as { connect_link_url?: unknown };
  if (typeof response.connect_link_url !== "string") throw new Error("Missing Connect Link");
  const link = new URL(response.connect_link_url);
  if (link.origin !== "https://pipedream.com" || link.pathname !== "/_static/connect.html")
    throw new Error("Unexpected Connect Link destination");
  link.searchParams.set("app", appSlug);
  return link.toString();
}
