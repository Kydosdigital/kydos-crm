import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyStripe } from "@/lib/stripe";
import { fireTrigger } from "@/lib/automation";
import { notifyOwner } from "@/lib/notify";
import { sendMetaEvent } from "@/lib/capi";
import { logActivity } from "@/lib/log";

// Stripe > Developers > Webhooks > <app>/api/webhooks/stripe, event checkout.session.completed. Secret = STRIPE_WEBHOOK_SECRET.
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyStripe(raw, req.headers.get("stripe-signature"))) return new Response("Invalid signature", { status: 403 });
  const ev = JSON.parse(raw);
  if (ev.type !== "checkout.session.completed") return new Response("ok");
  const id = ev.data?.object?.client_reference_id as string | undefined;
  if (!id) return new Response("ok");
  const db = supabaseAdmin();
  const { data: inv } = await db.from("invoices").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", id).neq("status", "paid").select("*").maybeSingle();
  if (!inv) return new Response("ok");
  const { data: c } = await db.from("contacts").select("tags").eq("id", inv.contact_id).single();
  if (!(c?.tags ?? []).includes("paid")) await db.from("contacts").update({ tags: [...(c?.tags ?? []), "paid"] }).eq("id", inv.contact_id);
  await db.from("notes").insert({ workspace_id: inv.workspace_id, contact_id: inv.contact_id, body: `Invoice ${inv.number} paid: £${inv.amount_gbp}` });
  await fireTrigger(inv.workspace_id, inv.contact_id, { type: "tag_added", tag: "paid" });
  await sendMetaEvent(inv.workspace_id, inv.contact_id, "Purchase", Number(inv.amount_gbp));
  await notifyOwner(inv.workspace_id, `Invoice ${inv.number} paid`, `£${inv.amount_gbp} received for ${inv.description}.`);
  await logActivity(inv.workspace_id, "stripe", "invoice paid", "invoice", inv.id, `£${inv.amount_gbp}`);
  return new Response("ok");
}
