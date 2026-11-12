import { supabaseAdmin } from "./supabase/admin";

const GRAPH = "https://graph.facebook.com/v23.0";
export type SocialChannel = "messenger" | "instagram";
const KEY: Record<SocialChannel, string> = { messenger: "messenger_psid", instagram: "instagram_id" };

/** Finds or creates the contact for a Messenger/Instagram sender and logs the inbound message. */
export async function receiveSocialDM(wsId: string, channel: SocialChannel, senderId: string, text: string, mid: string) {
  const db = supabaseAdmin();
  const key = KEY[channel];
  const { data: existing } = await db.from("contacts").select("id").eq("workspace_id", wsId).eq(`custom->>${key}`, senderId).maybeSingle();
  let id = existing?.id as string | undefined;
  if (!id) {
    let first: string | undefined, last: string | undefined;
    try {
      const r = await fetch(`${GRAPH}/${senderId}?fields=${channel === "messenger" ? "first_name,last_name" : "name,username"}&access_token=${process.env.META_PAGE_TOKEN}`);
      const j = await r.json();
      if (channel === "messenger") { first = j.first_name; last = j.last_name; } else { first = j.name ?? j.username; }
    } catch { /* name is optional */ }
    const { data } = await db.from("contacts").insert({ workspace_id: wsId, first_name: first ?? null, last_name: last ?? null, source: `${channel}-dm`, tags: [`${channel}-dm`], custom: { [key]: senderId } }).select("id").single();
    id = data?.id;
  }
  if (!id) return;
  await db.from("messages").insert({ workspace_id: wsId, contact_id: id, channel, direction: "in", body: text, status: "received", provider_id: mid });
}

/** Replies to a Messenger/Instagram contact. Allowed within 24h of their last message (7 days with the human agent tag). */
export async function sendSocialDM(wsId: string, c: { id: string; custom: Record<string, unknown> | null }, channel: SocialChannel, body: string) {
  const db = supabaseAdmin();
  const base = { workspace_id: wsId, contact_id: c.id, channel, direction: "out", body };
  try {
    const rid = (c.custom ?? {})[KEY[channel]];
    if (!rid) throw new Error(`This contact has no ${channel} identity`);
    if (!process.env.META_PAGE_TOKEN) throw new Error("META_PAGE_TOKEN is not set");
    const r = await fetch(`${GRAPH}/me/messages?access_token=${process.env.META_PAGE_TOKEN}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: String(rid) }, message: { text: body }, messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message ?? `Meta ${r.status}`);
    await db.from("messages").insert({ ...base, status: "sent", provider_id: j.message_id });
    return { ok: true as const };
  } catch (e) {
    await db.from("messages").insert({ ...base, status: "failed", error: String(e) });
    return { ok: false as const, error: String(e) };
  }
}
