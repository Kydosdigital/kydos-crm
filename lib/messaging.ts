import twilio from "twilio";
import { Resend } from "resend";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "./supabase/admin";
import { trackHtml } from "./tracking";
import { brandEmail, brandText } from "./emailBrand";

type Workspace = {
  id: string;
  name: string;
  email_from: string | null;
  sms_from: string | null;
  whatsapp_from: string | null;
  business_address: string | null;
  brand_color?: string | null;
  logo_url?: string | null;
  email_signature?: string | null;
  reply_to?: string | null;
  website_url?: string | null;
};
type Contact = {
  id: string;
  workspace_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  email_opt_out: boolean;
  sms_opt_out: boolean;
};

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/** UK-friendly E.164 normalisation: 07700 900123 -> +447700900123 */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) return d;
  if (d.startsWith("00")) return "+" + d.slice(2);
  if (d.startsWith("0")) return "+44" + d.slice(1);
  return d.length > 9 ? "+" + d : null;
}

export function unsubToken(contactId: string) {
  return createHmac("sha256", process.env.CRON_SECRET!).update(contactId).digest("hex").slice(0, 32);
}
export function verifyUnsubToken(contactId: string, token: string) {
  const a = Buffer.from(unsubToken(contactId));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Replaces {{first_name}}, {{last_name}}, {{email}}, {{company}} placeholders. */
export function render(template: string, c: Contact & { company?: string | null; custom?: Record<string, unknown> | null }, extra: Record<string, string> = {}) {
  const vars: Record<string, string> = {
    ...Object.fromEntries(Object.entries(c.custom ?? {}).map(([k, v]) => [k, String(v ?? "")])),
    ...extra,
    first_name: c.first_name ?? "there",
    last_name: c.last_name ?? "",
    email: c.email ?? "",
    company: c.company ?? "",
  };
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}

async function log(row: Record<string, unknown>) {
  await supabaseAdmin().from("messages").insert(row);
}

export async function sendEmail(ws: Workspace, c: Contact, subject: string, body: string) {
  const base = { workspace_id: ws.id, contact_id: c.id, channel: "email", direction: "out", subject, body };
  if (!c.email || c.email_opt_out) {
    await log({ ...base, status: "failed", error: c.email ? "Contact opted out" : "No email address" });
    return { ok: false as const, error: "blocked" };
  }
  if (!ws.email_from) {
    await log({ ...base, status: "failed", error: "Workspace has no email_from set" });
    return { ok: false as const, error: "no sender" };
  }
  const unsub = `${appUrl()}/u/${c.id}?t=${unsubToken(c.id)}`;
  const db = supabaseAdmin();
  const { data: row } = await db.from("messages").insert({ ...base, status: "queued" }).select("id").single();
  const html = brandEmail(ws, body, { unsubscribeUrl: unsub, preheader: body.replace(/\s+/g, " ").slice(0, 110) });
  try {
    const { data, error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: ws.email_from,
      to: c.email,
      subject,
      html: row ? trackHtml(html, row.id) : html,
      text: brandText(ws, body, unsub),
      ...(ws.reply_to ? { replyTo: ws.reply_to } : {}),
      headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    });
    if (error) throw new Error(error.message);
    if (row) await db.from("messages").update({ status: "sent", provider_id: data?.id }).eq("id", row.id);
    return { ok: true as const };
  } catch (e) {
    if (row) await db.from("messages").update({ status: "failed", error: String(e) }).eq("id", row.id);
    return { ok: false as const, error: String(e) };
  }
}

export async function sendSms(ws: Workspace, c: Contact, body: string, channel: "sms" | "whatsapp" = "sms") {
  const base = { workspace_id: ws.id, contact_id: c.id, channel, direction: "out", body };
  const from = channel === "whatsapp" ? ws.whatsapp_from : ws.sms_from;
  if (!c.phone || c.sms_opt_out) {
    await log({ ...base, status: "failed", error: c.phone ? "Contact opted out" : "No phone number" });
    return { ok: false as const, error: "blocked" };
  }
  if (!from) {
    await log({ ...base, status: "failed", error: `Workspace has no ${channel} sender set` });
    return { ok: false as const, error: "no sender" };
  }
  try {
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const isService = from.startsWith("MG");
    const to = channel === "whatsapp" ? `whatsapp:${c.phone}` : c.phone;
    const msg = await client.messages.create({
      to,
      body,
      ...(isService ? { messagingServiceSid: from } : { from }),
      statusCallback: `${appUrl()}/api/webhooks/twilio?type=status`,
    });
    await log({ ...base, status: "sent", provider_id: msg.sid, segments: Number(msg.numSegments ?? 1) });
    return { ok: true as const };
  } catch (e) {
    await log({ ...base, status: "failed", error: String(e) });
    return { ok: false as const, error: String(e) };
  }
}
