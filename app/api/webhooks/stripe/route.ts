import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyStripe } from "@/lib/stripe";
import { fireTrigger } from "@/lib/automation";
import { notifyOwner } from "@/lib/notify";
import { sendMetaEvent } from "@/lib/capi";
import { logActivity } from "@/lib/log";

// A 'processing' claim older than this is treated as abandoned (the earlier attempt was killed) and may be taken over (KD-163).
const STALE_CLAIM_MS = 10 * 60 * 1000;

// Stripe > Developers > Webhooks > <app>/api/webhooks/stripe, events checkout.session.completed, invoice.paid, invoice.payment_failed, customer.subscription.deleted. Secret = STRIPE_WEBHOOK_SECRET.
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyStripe(raw, req.headers.get("stripe-signature"))) return new Response("Invalid signature", { status: 403 });
  const ev = JSON.parse(raw);
  const db = supabaseAdmin();
  // Stripe redelivers events. Claim the event id as 'processing' first; mark it 'processed' only after the handler succeeds (KD-163).
  const eventId = String(ev.id);
  const { error: claimErr } = await db.from("stripe_events").insert({ event_id: eventId, type: String(ev.type), status: "processing" });
  if (claimErr) {
    if (claimErr.code !== "23505") return new Response("Could not record event", { status: 500 });
    const { data: prior } = await db.from("stripe_events").select("status").eq("event_id", eventId).maybeSingle();
    // Already finished: acknowledge the repeat.
    if (prior?.status === "processed") return new Response("ok");
    // Still processing: if the claim is stale (an earlier attempt was killed mid-run), take it over atomically. Otherwise ask Stripe to retry later.
    const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
    const { data: reclaimed } = await db
      .from("stripe_events")
      .update({ status: "processing", received_at: new Date().toISOString() })
      .eq("event_id", eventId)
      .eq("status", "processing")
      .lt("received_at", staleBefore)
      .select("event_id");
    if (!reclaimed || reclaimed.length === 0) return new Response("Event still processing", { status: 500 });
  }
  try {
    const res = await handleEvent(db, ev);
    const { error: doneErr } = await db.from("stripe_events").update({ status: "processed" }).eq("event_id", eventId);
    if (doneErr) throw doneErr;
    return res;
  } catch (err) {
    // Release the claim so Stripe's retry runs the event again instead of being acknowledged as a duplicate (KD-163).
    await db.from("stripe_events").delete().eq("event_id", eventId);
    throw err;
  }
}

// The Stripe payload is untyped JSON, as in the original handler.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleEvent(db: ReturnType<typeof supabaseAdmin>, ev: any): Promise<Response> {
  const o = ev.data?.object ?? {};
  // Retainers (monthly card subscriptions)
  if (ev.type === "checkout.session.completed" && String(o.client_reference_id ?? "").startsWith("ret:")) {
    const rid = String(o.client_reference_id).slice(4);
    const { data: r } = await db.from("retainers").update({ status: "active", stripe_customer_id: o.customer, stripe_subscription_id: o.subscription, started_at: new Date().toISOString() }).eq("id", rid).select("*").maybeSingle();
    if (r) {
      await tagContact(db, r.workspace_id, r.contact_id, "retainer-client");
      await fireTrigger(r.workspace_id, r.contact_id, { type: "tag_added", tag: "retainer-client" });
      await sendMetaEvent(r.workspace_id, r.contact_id, "Purchase", Number(r.amount_gbp));
      await notifyOwner(r.workspace_id, "New retainer started", `£${r.amount_gbp}/month: ${r.description}`);
      await logActivity(r.workspace_id, "stripe", "retainer started", "retainer", r.id, `£${r.amount_gbp}/month`);
    }
    return new Response("ok");
  }
  if (ev.type === "invoice.paid" || ev.type === "invoice.payment_failed" || ev.type === "customer.subscription.deleted") {
    const subId = (ev.type === "customer.subscription.deleted" ? o.id : o.subscription) as string | undefined;
    if (!subId) return new Response("ok");
    const { data: r } = await db.from("retainers").select("*").eq("stripe_subscription_id", subId).maybeSingle();
    if (!r) return new Response("ok");
    if (ev.type === "invoice.paid") {
      await db.from("retainers").update({ status: "active", last_paid_at: new Date().toISOString(), paid_count: (r.paid_count ?? 0) + 1 }).eq("id", r.id);
      await db.from("notes").insert({ workspace_id: r.workspace_id, contact_id: r.contact_id, body: `Retainer payment received: £${r.amount_gbp}` });
      await logActivity(r.workspace_id, "stripe", "retainer paid", "retainer", r.id, `£${r.amount_gbp}`);
      await fireTrigger(r.workspace_id, r.contact_id, { type: "invoice_paid" });
    } else if (ev.type === "invoice.payment_failed") {
      await db.from("retainers").update({ status: "past_due" }).eq("id", r.id);
      await tagContact(db, r.workspace_id, r.contact_id, "payment-failed");
      await fireTrigger(r.workspace_id, r.contact_id, { type: "tag_added", tag: "payment-failed" });
      await notifyOwner(r.workspace_id, "Retainer payment failed", `£${r.amount_gbp}/month: ${r.description}. Stripe will retry automatically.`);
    } else {
      await db.from("retainers").update({ status: "cancelled" }).eq("id", r.id);
      await logActivity(r.workspace_id, "stripe", "retainer cancelled", "retainer", r.id);
    }
    return new Response("ok");
  }
  if (ev.type !== "checkout.session.completed") return new Response("ok");
  const id = o.client_reference_id as string | undefined;
  if (!id) return new Response("ok");
  const { data: inv } = await db.from("invoices").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", id).neq("status", "paid").select("*").maybeSingle();
  if (!inv) return new Response("ok");
  const { data: c } = await db.from("contacts").select("tags").eq("id", inv.contact_id).single();
  if (!(c?.tags ?? []).includes("paid")) await db.from("contacts").update({ tags: [...(c?.tags ?? []), "paid"] }).eq("id", inv.contact_id);
  await db.from("notes").insert({ workspace_id: inv.workspace_id, contact_id: inv.contact_id, body: `Invoice ${inv.number} paid: £${inv.amount_gbp}` });
  await fireTrigger(inv.workspace_id, inv.contact_id, { type: "tag_added", tag: "paid" });
  await fireTrigger(inv.workspace_id, inv.contact_id, { type: "invoice_paid" });
  await sendMetaEvent(inv.workspace_id, inv.contact_id, "Purchase", Number(inv.amount_gbp));
  await notifyOwner(inv.workspace_id, `Invoice ${inv.number} paid`, `£${inv.amount_gbp} received for ${inv.description}.`);
  await logActivity(inv.workspace_id, "stripe", "invoice paid", "invoice", inv.id, `£${inv.amount_gbp}`);
  return new Response("ok");
}

async function tagContact(db: ReturnType<typeof supabaseAdmin>, ws: string, contactId: string, tag: string) {
  const { data: c } = await db.from("contacts").select("tags").eq("id", contactId).eq("workspace_id", ws).single();
  if (c && !(c.tags ?? []).includes(tag)) await db.from("contacts").update({ tags: [...(c.tags ?? []), tag] }).eq("id", contactId);
}
