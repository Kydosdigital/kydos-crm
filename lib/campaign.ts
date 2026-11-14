import { supabaseAdmin } from "./supabase/admin";
import { sendEmail, sendSms, render } from "./messaging";
import { sendWhatsAppTemplate } from "./whatsapp";
import { matchList, matchListVerified } from "./lists";

export type Channel = "email" | "sms" | "whatsapp";
export const CAP: Record<Channel, number> = { email: 90, sms: 100, whatsapp: 100 };
type Contact = Awaited<ReturnType<typeof matchList>>[number];

/**
 * Legacy single-send audience. The 90/100 limit still applies until the
 * durable campaign queue is fully integrated. Do not silently truncate an
 * audience, including smart lists that may exceed matchList's 5,000-row cap.
 * Callers MUST refuse to send or schedule when incomplete is true or when
 * total is larger than people.length.
 */
export async function audience(wsId: string, a: { tag?: string | null; listId?: string | null }, channel: Channel) {
  const db = supabaseAdmin();
  let people: Contact[] = [];
  if (a.listId) {
    // matchList fetches at most 5,000 unfiltered workspace contacts. If that
    // limit could be exceeded, there is no safe way to prove list completeness.
    const { count, error: sizeError } = await db.from("contacts")
      .select("id", { count: "exact", head: true }).eq("workspace_id", wsId);
    if (sizeError || count === null || count > 5000) {
      return { total: 0, people: [] as Contact[], incomplete: true };
    }
    const { data: l, error: listError } = await db.from("smart_lists")
      .select("filter").eq("id", a.listId).eq("workspace_id", wsId).single();
    // Engagement-based smart lists currently use a 90-contact lookback in
    // loadEngagement, so completeness cannot be guaranteed even under 5,000.
    if (listError || !l || (l.filter as { state?: string } | null)?.state) {
      return { total: 0, people: [] as Contact[], incomplete: true };
    }
    const verified = await matchListVerified(wsId, l.filter);
    if (verified.incomplete) return { total: 0, people: [] as Contact[], incomplete: true };
    people = verified.people;
  } else if (a.tag) {
    const { data, count, error } = await db.from("contacts")
      .select("*", { count: "exact" }).eq("workspace_id", wsId)
      .contains("tags", [a.tag]).limit(5000);
    if (error || count === null || count > 5000 || (data?.length ?? 0) !== count) {
      return { total: 0, people: [] as Contact[], incomplete: true };
    }
    people = (data ?? []) as Contact[];
  }
  const ok = people.filter((c) => (channel === "email" ? c.email && !c.email_opt_out : c.phone && !c.sms_opt_out));
  return { total: ok.length, people: ok.slice(0, CAP[channel]), incomplete: false };
}

export type Message = { channel: Channel; subject?: string | null; body?: string | null; wa_template?: string | null; wa_lang?: string | null };

/** Sends one campaign message to one contact. SMS gets an opt-out line; WhatsApp must be an approved template, whose variables come from the body (one per line). */
export async function deliver(ws: Parameters<typeof sendEmail>[0], c: Contact, m: Message) {
  if (m.channel === "email") return sendEmail(ws, c, render(m.subject ?? "", c), render(m.body ?? "", c));
  if (m.channel === "sms") return sendSms(ws, c, `${render(m.body ?? "", c)}\nReply STOP to opt out`, "sms");
  const vars = (m.body ?? "").split("\n").map((v) => render(v.trim(), c)).filter(Boolean);
  return sendWhatsAppTemplate(ws, c, m.wa_template ?? "", vars, m.wa_lang || "en_GB");
}
