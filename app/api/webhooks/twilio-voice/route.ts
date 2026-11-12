import twilio from "twilio";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { toE164 } from "@/lib/messaging";
import { fireTrigger } from "@/lib/automation";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";
import { notifyOwner } from "@/lib/notify";
import { logActivity } from "@/lib/log";

// Twilio number > Voice > "A call comes in" > Webhook (POST) > <app>/api/webhooks/twilio-voice
// Rings workspaces.call_forward_number for 20 seconds; if unanswered, logs a missed call, tags the contact and sends a WhatsApp.
const xml = (body: string) => new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, { headers: { "Content-Type": "text/xml" } });

export async function POST(req: Request) {
  const raw = await req.text();
  const params = Object.fromEntries(new URLSearchParams(raw));
  const u = new URL(req.url);
  const valid = twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN!, req.headers.get("x-twilio-signature") ?? "", `${process.env.NEXT_PUBLIC_APP_URL}${u.pathname}${u.search}`, params);
  if (!valid) return new Response("Invalid signature", { status: 403 });

  const db = supabaseAdmin();
  const stage = u.searchParams.get("stage");
  const callNumber = (stage === "done" ? params.To : params.To)?.trim();
  // A tracking number belongs to a workspace and tags callers with a campaign; the main call number has no tag.
  const { data: tn } = await db.from("tracking_numbers").select("*").eq("number", callNumber).maybeSingle();
  const { data: ws } = tn
    ? await db.from("workspaces").select("*").eq("id", tn.workspace_id).maybeSingle()
    : await db.from("workspaces").select("*").eq("call_number", callNumber).maybeSingle();
  if (!ws) return xml(`<Say voice="Polly.Amy" language="en-GB">Sorry, this number is not in service.</Say>`);

  if (stage !== "done") {
    // First leg: ring the owner.
    if (!ws.call_forward_number) return xml(`<Say voice="Polly.Amy" language="en-GB">Thanks for calling ${ws.name}. We will message you shortly.</Say>`.concat(""));
    await db.from("call_logs").upsert({ workspace_id: ws.id, direction: "in", from_number: params.From, to_number: params.To, status: "ringing", sid: params.CallSid, tracking_label: tn?.label ?? null }, { onConflict: "sid" });
    return xml(`<Dial timeout="20" callerId="${callNumber}" action="${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio-voice?stage=done"><Number>${ws.call_forward_number}</Number></Dial>`);
  }

  // Second leg: the dial result.
  const status = params.DialCallStatus; // completed | no-answer | busy | failed | canceled
  const missed = status !== "completed";
  const phone = toE164(params.From);
  await db.from("call_logs").update({ status: missed ? "missed" : "answered", duration_seconds: Number(params.DialCallDuration) || null }).eq("sid", params.CallSid);
  if (!phone) return xml("");
  let { data: c } = await db.from("contacts").select("*").eq("workspace_id", ws.id).eq("phone", phone).maybeSingle();
  if (!c) {
    const ins = await db.from("contacts").insert({ workspace_id: ws.id, phone, source: tn?.utm_source || "inbound-call", utm_source: tn?.utm_source ?? null, utm_medium: tn?.utm_medium ?? null, utm_campaign: tn?.utm_campaign ?? null, tags: [] }).select("*").single();
    c = ins.data;
    if (c) await fireTrigger(ws.id, c.id, { type: "contact_created" });
  }
  if (c) {
    if (tn && !c.utm_source && !c.utm_campaign) await db.from("contacts").update({ utm_source: tn.utm_source, utm_medium: tn.utm_medium, utm_campaign: tn.utm_campaign }).eq("id", c.id);
    await db.from("call_logs").update({ contact_id: c.id }).eq("sid", params.CallSid);
    if (missed) {
      if (!(c.tags ?? []).includes("missed-call")) await db.from("contacts").update({ tags: [...(c.tags ?? []), "missed-call"] }).eq("id", c.id);
      await db.from("notes").insert({ workspace_id: ws.id, contact_id: c.id, body: "Missed call" });
      if (ws.missed_call_template) await sendWhatsAppTemplate(ws, c, ws.missed_call_template, [c.first_name || "there"]);
      await fireTrigger(ws.id, c.id, { type: "missed_call" });
      await notifyOwner(ws.id, `Missed call from ${c.first_name ?? phone}`, `${phone} called ${callNumber}${tn ? ` (${tn.label})` : ""}. A WhatsApp was ${ws.missed_call_template ? "sent" : "not sent (no template set in Settings)"}.`);
      await logActivity(ws.id, "twilio", "missed_call", "contact", c.id, phone);
    }
  }
  return xml("");
}
