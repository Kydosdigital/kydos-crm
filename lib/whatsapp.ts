import { supabaseAdmin } from "./supabase/admin";

type C = { id: string; first_name: string | null; phone: string | null; sms_opt_out: boolean };
type Ws = { id: string };

const GRAPH = "https://graph.facebook.com/v23.0";

/** Sends a WhatsApp template message through the Meta Cloud API and logs it. vars fill {{1}}, {{2}}... in order. */
export async function sendWhatsAppTemplate(ws: Ws, c: C, template: string, vars: string[], lang = "en_GB") {
  const base = { workspace_id: ws.id, contact_id: c.id, channel: "whatsapp", direction: "out", subject: template, body: `[template ${template}] ${vars.join(" | ")}` };
  const db = supabaseAdmin();
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  try {
    if (!c.phone || c.sms_opt_out) throw new Error(c.phone ? "Contact opted out" : "No phone number");
    if (!token || !phoneId) throw new Error("WhatsApp is not configured (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID)");
    const r = await fetch(`${GRAPH}/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: c.phone.replace(/^\+/, ""),
        type: "template",
        template: {
          name: template,
          language: { code: lang },
          components: vars.length ? [{ type: "body", parameters: vars.map((v) => ({ type: "text", text: v })) }] : [],
        },
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message ?? `WhatsApp ${r.status}`);
    await db.from("messages").insert({ ...base, status: "sent", provider_id: j.messages?.[0]?.id });
    return { ok: true as const };
  } catch (e) {
    await db.from("messages").insert({ ...base, status: "failed", error: String(e) });
    return { ok: false as const, error: String(e) };
  }
}

/** Free-text reply, only valid inside the 24 hour window after the contact last messaged you. */
export async function sendWhatsAppText(ws: Ws, c: C, text: string) {
  const base = { workspace_id: ws.id, contact_id: c.id, channel: "whatsapp", direction: "out", body: text };
  const db = supabaseAdmin();
  try {
    if (!c.phone || c.sms_opt_out) throw new Error(c.phone ? "Contact opted out" : "No phone number");
    const r = await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: c.phone.replace(/^\+/, ""), type: "text", text: { body: text } }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message ?? `WhatsApp ${r.status}`);
    await db.from("messages").insert({ ...base, status: "sent", provider_id: j.messages?.[0]?.id });
    return { ok: true as const };
  } catch (e) {
    await db.from("messages").insert({ ...base, status: "failed", error: String(e) });
    return { ok: false as const, error: String(e) };
  }
}
