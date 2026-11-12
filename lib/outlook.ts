import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { supabaseAdmin } from "./supabase/admin";

const SCOPES = "offline_access User.Read Mail.Send Mail.ReadWrite";
const tenant = () => process.env.MICROSOFT_TENANT_ID!;
const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
export const redirectUri = () => `${appUrl()}/api/auth/microsoft/callback`;

const key = () => createHash("sha256").update(process.env.CRON_SECRET!).digest();
export function encrypt(text: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}
export function decrypt(blob: string) {
  const [iv, tag, enc] = blob.split(".").map((p) => Buffer.from(p, "base64"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

export function authUrl(state: string) {
  const p = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    response_type: "code",
    redirect_uri: redirectUri(),
    response_mode: "query",
    scope: SCOPES,
    state,
    prompt: "select_account",
  });
  return `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/authorize?${p}`;
}

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch(`https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      scope: SCOPES,
      ...params,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description ?? "Microsoft token request failed");
  return json as { access_token: string; refresh_token?: string };
}

export const exchangeCode = (code: string) =>
  tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri() });

async function accessToken(workspaceId: string) {
  const db = supabaseAdmin();
  const { data } = await db.from("mail_connections").select("*").eq("workspace_id", workspaceId).maybeSingle();
  if (!data) return null;
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: decrypt(data.refresh_token_enc) });
  if (t.refresh_token) {
    await db.from("mail_connections").update({ refresh_token_enc: encrypt(t.refresh_token) }).eq("workspace_id", workspaceId);
  }
  return { token: t.access_token, account: data.account_email as string, lastSynced: data.last_synced_at as string | null };
}

export async function graphMe(token: string) {
  const r = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = await r.json();
  return (j.mail ?? j.userPrincipalName) as string;
}

/** Sends a one-to-one email from the connected Outlook mailbox and logs it in the inbox. */
export async function sendFromOutlook(
  ws: { id: string },
  c: { id: string; email: string | null },
  subject: string,
  body: string,
) {
  const base = { workspace_id: ws.id, contact_id: c.id, channel: "email", direction: "out", subject, body };
  const db = supabaseAdmin();
  try {
    if (!c.email) throw new Error("No email address");
    const a = await accessToken(ws.id);
    if (!a) throw new Error("Outlook is not connected");
    const html = body.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
    const r = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: { Authorization: `Bearer ${a.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: { subject, body: { contentType: "HTML", content: html }, toRecipients: [{ emailAddress: { address: c.email } }] },
        saveToSentItems: true,
      }),
    });
    if (!r.ok) throw new Error(`Graph sendMail ${r.status}: ${await r.text()}`);
    await db.from("messages").insert({ ...base, status: "sent" });
    return { ok: true as const };
  } catch (e) {
    await db.from("messages").insert({ ...base, status: "failed", error: String(e) });
    return { ok: false as const, error: String(e) };
  }
}

type GraphMsg = {
  id: string;
  subject: string | null;
  bodyPreview: string;
  body?: { content: string; contentType: string };
  receivedDateTime: string;
  from?: { emailAddress?: { address?: string } };
};

/** Pulls new inbox mail since the last sync and stores messages from known contacts. */
export async function syncInbox(workspaceId: string) {
  const db = supabaseAdmin();
  const a = await accessToken(workspaceId);
  if (!a) return 0;
  const since = a.lastSynced ?? new Date(Date.now() - 7 * 864e5).toISOString();
  const started = new Date().toISOString();
  const url =
    `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=50&$orderby=receivedDateTime desc` +
    `&$select=id,subject,bodyPreview,receivedDateTime,from&$filter=receivedDateTime ge ${since}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${a.token}` } });
  if (!r.ok) throw new Error(`Graph inbox ${r.status}: ${await r.text()}`);
  const msgs = ((await r.json()).value ?? []) as GraphMsg[];
  let stored = 0;
  for (const m of msgs) {
    const from = m.from?.emailAddress?.address?.toLowerCase();
    if (!from || from === a.account.toLowerCase()) continue;
    const { data: contact } = await db
      .from("contacts").select("id").eq("workspace_id", workspaceId).ilike("email", from).maybeSingle();
    if (!contact) continue;
    const { error } = await db.from("messages").insert({
      workspace_id: workspaceId, contact_id: contact.id, channel: "email", direction: "in",
      subject: m.subject, body: m.bodyPreview, status: "received", provider_id: m.id, created_at: m.receivedDateTime,
    });
    if (!error) stored++;
  }
  await db.from("mail_connections").update({ last_synced_at: started }).eq("workspace_id", workspaceId);
  return stored;
}

export async function syncAllInboxes() {
  const { data } = await supabaseAdmin().from("mail_connections").select("workspace_id");
  let total = 0;
  for (const row of data ?? []) {
    try { total += await syncInbox(row.workspace_id); } catch (e) { console.error("outlook sync", e); }
  }
  return total;
}
