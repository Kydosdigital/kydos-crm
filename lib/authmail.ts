import { Resend } from "resend";
import { supabaseAdmin } from "./supabase/admin";
import { brandEmail, brandText } from "./emailBrand";

export type LinkKind = "login" | "reset" | "invite";

/**
 * Sends a branded one-click sign-in, password-reset or invite email through Resend.
 * The link carries a Supabase token hash to /auth/confirm, so no Supabase redirect or SMTP settings are needed.
 * Login and reset only go to emails that already have an account (nothing is revealed to the visitor either way).
 */
export async function sendAuthLink(email: string, kind: LinkKind) {
  email = email.trim().toLowerCase();
  const admin = supabaseAdmin();
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = users?.users.find((u) => u.email?.toLowerCase() === email);
  if (!existing && kind !== "invite") return { ok: false as const, error: "no account" };
  const type = !existing ? "invite" : kind === "reset" ? "recovery" : "magiclink";
  const { data, error } = await admin.auth.admin.generateLink({ type, email } as Parameters<typeof admin.auth.admin.generateLink>[0]);
  const hash = data?.properties?.hashed_token;
  if (error || !hash) return { ok: false as const, error: error?.message ?? "Could not create link" };
  const userId = data.user?.id ?? existing?.id;
  const { data: mem } = await admin.from("workspace_members").select("workspace_id").eq("user_id", userId ?? "").limit(1).maybeSingle();
  const { data: ws } = mem
    ? await admin.from("workspaces").select("*").eq("id", mem.workspace_id).single()
    : await admin.from("workspaces").select("*").order("created_at").limit(1).single();
  if (!ws?.email_from) return { ok: false as const, error: "Workspace has no email_from set" };
  const next = kind === "login" ? "/contacts" : "/set-password";
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm?token_hash=${hash}&type=${type}&next=${encodeURIComponent(next)}`;
  const copy = {
    login: { subject: `Your sign-in link for ${ws.name}`, body: `Hi,\n\nUse the button below to sign in to ${ws.name}. It works once and expires soon.\n\n[button: Sign in | ${url}]\n\nIf you did not ask for this, you can ignore this email.` },
    reset: { subject: `Set a new password for ${ws.name}`, body: `Hi,\n\nUse the button below to choose a new password.\n\n[button: Set my password | ${url}]\n\nIf you did not ask for this, you can ignore this email.` },
    invite: { subject: `You have been invited to ${ws.name}`, body: `Hi,\n\nYou have been invited to join ${ws.name} on our CRM. Use the button below to get in and choose a password.\n\n[button: Accept invite | ${url}]` },
  }[kind];
  const res = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: ws.email_from, to: email, subject: copy.subject,
    html: brandEmail(ws, copy.body), text: brandText(ws, copy.body),
  });
  if (res.error) return { ok: false as const, error: res.error.message };
  return { ok: true as const, userId };
}
