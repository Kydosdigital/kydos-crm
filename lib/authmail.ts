import { Resend } from "resend";
import { supabaseAdmin } from "./supabase/admin";
import { brandEmail, brandText } from "./emailBrand";

export type LinkKind = "login" | "reset" | "invite";
type SendResult =
  | { ok: true; userId: string | undefined }
  | { ok: false; error: string };

function failure(stage: "user_lookup" | "workspace_sender" | "token" | "provider_config" | "provider_rejected", code?: string): SendResult {
  // No email address, token, full Resend error or other user identifying data.
  console.error("[authmail] Sign-in email dispatch failed", { stage, code: code?.slice(0, 45) });
  return { ok: false, error: "Authentication email could not be sent" };
}

function senderReady(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const raw = value.trim();
  const address = raw.includes("<") && raw.endsWith(">") ? raw.slice(raw.lastIndexOf("<") + 1, -1) : raw;
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address);
}

/**
 * Lists the existing users before generating links. Supabase's magiclink
 * admin operation can create accounts; we must not allow login to sign up
 * unknown addresses. Pagination fixes the old first-1,000-users limit.
 */
async function findExistingUser(email: string): Promise<{ id: string } | null | "lookup_failed"> {
  const db = supabaseAdmin();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data) return "lookup_failed";
    const match = data.users.find(u => u.email?.trim().toLowerCase() === email);
    if (match) return { id: match.id };
    if (data.users.length < 1000) return null;
  }
  return "lookup_failed";
}

/**
 * Send a link using a workspace the user actually belongs to.
 * An existing user may have several memberships, including a synthetic
 * workspace without an email sender. Prefer a configured member workspace.
 * Newly registered users without membership use only the platform sender.
 * Invites use the requesting admin's explicit workspace, not a random one.
 */
export async function sendAuthLink(email: string, kind: LinkKind, inviteWorkspaceId?: string): Promise<SendResult> {
  email = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    return { ok: false, error: "Invalid email" };

  const db = supabaseAdmin();
  const existing = await findExistingUser(email);
  if (existing === "lookup_failed") return failure("user_lookup");
  if (!existing && kind !== "invite") return { ok: false, error: "no account" };

  type Workspace = { id: string; name: string; email_from: string | null; created_at: string; brand_color: string | null; logo_url: string | null; email_signature: string | null; business_address: string | null; website_url: string | null };
  let ws: Workspace | undefined;
  if (kind === "invite") {
    if (!inviteWorkspaceId) return failure("workspace_sender", "invite_workspace_missing");
    const { data, error } = await db.from("workspaces")
      .select("id,name,email_from,created_at,brand_color,logo_url,email_signature,business_address,website_url").eq("id", inviteWorkspaceId).maybeSingle();
    if (error || !data || !senderReady(data.email_from))
      return failure("workspace_sender", "invite_workspace_unconfigured");
    ws = data as Workspace;
  } else {
    if (!existing) return { ok: false, error: "no account" };
    const { data: memberships, error: membershipError } = await db.from("workspace_members")
      .select("workspace_id").eq("user_id", existing.id);
    if (membershipError || !memberships) return failure("workspace_sender", "membership_lookup_failed");
    if (memberships.length) {
      const ids = memberships.map(m => m.workspace_id);
      const { data: workspaces, error: workspacesError } = await db.from("workspaces")
        .select("id,name,email_from,created_at,brand_color,logo_url,email_signature,business_address,website_url")
        .in("id", ids).order("created_at", { ascending: true });
      if (workspacesError) return failure("workspace_sender", "workspace_lookup_failed");
      ws = (workspaces ?? []).find(w => senderReady(w.email_from)) as Workspace | undefined;
    }

    if (!ws) {
      // Accounts created by self-service signup may have no workspace yet.
      // Authentication is a platform service, not a tenant permission:
      // use the existing platform-owned sender only as an email identity.
      // Never grant workspace membership, role or workspace data here.
      const { data: platform, error: platformError } = await db.from("workspaces")
        .select("id,name,email_from,created_at,brand_color,logo_url,email_signature,business_address,website_url")
        .eq("slug", "kydos-digital").maybeSingle();
      if (platformError) return failure("workspace_sender", "platform_lookup_failed");
      if (platform && senderReady(platform.email_from))
        ws = platform as Workspace;
    }
    if (!ws) return failure("workspace_sender", "no_platform_sender");
  }

  const urlBase = process.env.NEXT_PUBLIC_APP_URL;
  if (!process.env.RESEND_API_KEY || !urlBase) return failure("provider_config", "missing_env");
  let confirm: URL;
  try {
    confirm = new URL("/auth/confirm", urlBase);
    if (process.env.NODE_ENV === "production" && confirm.protocol !== "https:")
      return failure("provider_config", "invalid_app_url");
  } catch {
    return failure("provider_config", "invalid_app_url");
  }

  const type = !existing ? "invite" : kind === "reset" ? "recovery" : "magiclink";
  const { data, error } = await db.auth.admin.generateLink({
    type, email,
  } as Parameters<typeof db.auth.admin.generateLink>[0]);
  const hash = data?.properties?.hashed_token;
  if (error || !hash) return failure("token", error?.name);
  const userId = data.user?.id ?? (existing ? existing.id : undefined);
  confirm.searchParams.set("token_hash", hash);
  confirm.searchParams.set("type", type);
  confirm.searchParams.set("next", kind === "login" ? "/contacts" : "/set-password");
  const url = confirm.toString();

  const copy = {
    login: { subject: `Your sign-in link for ${ws.name}`, body: `Hi,\n\nUse the button below to sign in to ${ws.name}. It works once and expires soon.\n\n[button: Sign in | ${url}]\n\nIf you did not ask for this, you can ignore this email.` },
    reset: { subject: `Set a new password for ${ws.name}`, body: `Hi,\n\nUse the button below to choose a new password.\n\n[button: Set my password | ${url}]\n\nIf you did not ask for this, you can ignore this email.` },
    invite: { subject: `You have been invited to ${ws.name}`, body: `Hi,\n\nYou have been invited to join ${ws.name} on our CRM. Use the button below to get in and choose a password.\n\n[button: Accept invite | ${url}]` },
  }[kind];

  try {
    const result = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: ws.email_from!, to: email, subject: copy.subject,
      html: brandEmail(ws, copy.body), text: brandText(ws, copy.body),
    });
    if (result.error) return failure("provider_rejected", result.error.name);
    if (!result.data?.id) return failure("provider_rejected", "no_provider_message_id");
  } catch {
    return failure("provider_rejected", "network_or_sdk_error");
  }
  return { ok: true, userId };
}
