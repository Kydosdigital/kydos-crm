import twilio from "twilio";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { toE164 } from "@/lib/messaging";


// One URL handles both inbound messages (set as the number's "A message comes in" webhook)
// and delivery status callbacks (?type=status, set automatically on every send).
export async function POST(req: Request) {
  const raw = await req.text();
  const params = Object.fromEntries(new URLSearchParams(raw));
  const url = `${process.env.NEXT_PUBLIC_APP_URL}${new URL(req.url).pathname}${new URL(req.url).search}`;
  const valid = twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN!, req.headers.get("x-twilio-signature") ?? "", url, params);
  if (!valid) return new Response("Invalid signature", { status: 403 });

  const db = supabaseAdmin();
  const type = new URL(req.url).searchParams.get("type");

  if (type === "status") {
    const status = params.MessageStatus; // queued, sent, delivered, undelivered, failed
    await db.from("messages").update({ status: status === "undelivered" ? "failed" : status, error: params.ErrorCode ?? null }).eq("provider_id", params.MessageSid);
    return new Response("ok");
  }

  // Inbound
  const isWa = params.From?.startsWith("whatsapp:");
  const phone = toE164(params.From?.replace("whatsapp:", ""));
  const toNumber = params.To?.replace("whatsapp:", "");
  if (!phone || !toNumber) return new Response("bad request", { status: 400 });

  // Find which business owns the number being messaged
  const { data: ws } = await db.from("workspaces").select("id").or(`sms_from.eq.${toNumber},whatsapp_from.eq.whatsapp:${toNumber}`).limit(1).maybeSingle();
  if (!ws) return new Response("<Response/>", { headers: { "Content-Type": "text/xml" } });

  let { data: contact } = await db.from("contacts").select("id").eq("workspace_id", ws.id).eq("phone", phone).maybeSingle();
  if (!contact) {
    const created = await db.from("contacts").insert({ workspace_id: ws.id, phone, source: "inbound " + (isWa ? "whatsapp" : "sms") }).select("id").single();
    contact = created.data;
  }
  if (!contact) return new Response("error", { status: 500 });

  const body = params.Body ?? "";
  if (/^\s*(stop|stopall|unsubscribe|cancel|end|quit)\s*$/i.test(body)) {
    await db.from("contacts").update({ sms_opt_out: true }).eq("id", contact.id);
  }
  await db.from("messages").insert({
    workspace_id: ws.id,
    contact_id: contact.id,
    channel: isWa ? "whatsapp" : "sms",
    direction: "in",
    body,
    status: "received",
    provider_id: params.MessageSid,
  });
  return new Response("<Response/>", { headers: { "Content-Type": "text/xml" } });
}
