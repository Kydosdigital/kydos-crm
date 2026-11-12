import twilio from "twilio";
import { supabaseAdmin } from "./supabase/admin";

/** Click-to-call: Twilio rings your mobile first, then bridges the contact. Number shown to them is your Twilio call number. */
export async function startCall(ws: { id: string; call_number: string | null; call_forward_number: string | null }, contact: { id: string; phone: string | null }) {
  if (!ws.call_number || !ws.call_forward_number) return { ok: false as const, error: "Set the Twilio call number and your mobile in Settings first" };
  if (!contact.phone) return { ok: false as const, error: "Contact has no phone number" };
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  const twiml = `<Response><Say voice="Polly.Amy" language="en-GB">Connecting you now.</Say><Dial callerId="${ws.call_number}"><Number>${contact.phone}</Number></Dial></Response>`;
  const call = await client.calls.create({ to: ws.call_forward_number, from: ws.call_number, twiml });
  await supabaseAdmin().from("call_logs").insert({ workspace_id: ws.id, contact_id: contact.id, direction: "out", from_number: ws.call_number, to_number: contact.phone, status: "started", sid: call.sid });
  return { ok: true as const };
}
