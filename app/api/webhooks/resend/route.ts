import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabase/admin";


// Resend -> Webhooks: add https://YOUR_APP/api/webhooks/resend and set RESEND_WEBHOOK_SECRET.
export async function POST(req: Request) {
  const payload = await req.text();
  let event: { type: string; data: { email_id: string; to?: string[] } };
  try {
    event = new Resend(process.env.RESEND_API_KEY).webhooks.verify({
      payload,
      headers: {
        id: req.headers.get("svix-id") ?? "",
        timestamp: req.headers.get("svix-timestamp") ?? "",
        signature: req.headers.get("svix-signature") ?? "",
      },
      webhookSecret: process.env.RESEND_WEBHOOK_SECRET!,
    }) as typeof event;
  } catch {
    return new Response("Invalid signature", { status: 403 });
  }

  const db = supabaseAdmin();
  const map: Record<string, string> = {
    "email.delivered": "delivered",
    "email.bounced": "failed",
    "email.complained": "failed",
  };
  const status = map[event.type];
  if (status) {
    await db.from("messages").update({ status }).eq("provider_id", event.data.email_id);
    const { data: em } = await db.from("messages").select("id,workspace_id,contact_id").eq("provider_id", event.data.email_id).maybeSingle();
    if (em) await db.from("message_events").insert({ workspace_id: em.workspace_id, message_id: em.id, contact_id: em.contact_id, type: event.type === "email.delivered" ? "delivered" : event.type === "email.bounced" ? "bounced" : "complained" });
    if (event.type !== "email.delivered") {
      // Bounce or spam complaint: stop emailing this contact
      const { data: m } = await db.from("messages").select("contact_id").eq("provider_id", event.data.email_id).maybeSingle();
      if (m) await db.from("contacts").update({ email_opt_out: true }).eq("id", m.contact_id);
    }
  }
  return new Response("ok");
}
