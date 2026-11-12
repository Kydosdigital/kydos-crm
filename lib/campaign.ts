import { supabaseAdmin } from "./supabase/admin";
import { sendEmail, sendSms, render } from "./messaging";
import { sendWhatsAppTemplate } from "./whatsapp";
import { matchList } from "./lists";

export type Channel = "email" | "sms" | "whatsapp";
export const CAP: Record<Channel, number> = { email: 90, sms: 100, whatsapp: 100 };
type Contact = Awaited<ReturnType<typeof matchList>>[number];

/** Contacts who can receive this channel (opt-outs and missing addresses excluded), capped per send. */
export async function audience(wsId: string, a: { tag?: string | null; listId?: string | null }, channel: Channel) {
  const db = supabaseAdmin();
  let people: Contact[] = [];
  if (a.listId) {
    const { data: l } = await db.from("smart_lists").select("filter").eq("id", a.listId).eq("workspace_id", wsId).single();
    people = l ? await matchList(wsId, l.filter) : [];
  } else if (a.tag) {
    const r = await db.from("contacts").select("*").eq("workspace_id", wsId).contains("tags", [a.tag]).limit(5000);
    people = (r.data ?? []) as Contact[];
  }
  const ok = people.filter((c) => (channel === "email" ? c.email && !c.email_opt_out : c.phone && !c.sms_opt_out));
  return { total: ok.length, people: ok.slice(0, CAP[channel]) };
}

export type Message = { channel: Channel; subject?: string | null; body?: string | null; wa_template?: string | null; wa_lang?: string | null };

/** Sends one campaign message to one contact. SMS gets an opt-out line; WhatsApp must be an approved template, whose variables come from the body (one per line). */
export async function deliver(ws: Parameters<typeof sendEmail>[0], c: Contact, m: Message) {
  if (m.channel === "email") return sendEmail(ws, c, render(m.subject ?? "", c), render(m.body ?? "", c));
  if (m.channel === "sms") return sendSms(ws, c, `${render(m.body ?? "", c)}\nReply STOP to opt out`, "sms");
  const vars = (m.body ?? "").split("\n").map((v) => render(v.trim(), c)).filter(Boolean);
  return sendWhatsAppTemplate(ws, c, m.wa_template ?? "", vars, m.wa_lang || "en_GB");
}
