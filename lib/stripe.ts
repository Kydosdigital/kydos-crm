import { createHmac, timingSafeEqual } from "crypto";

/** Creates a Stripe Checkout payment link for an invoice. Needs STRIPE_SECRET_KEY; returns null until it is set. */
export async function createPayLink(inv: { id: string; number: string; description: string; amount_gbp: number; email?: string | null }) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  const p = new URLSearchParams({
    mode: "payment",
    "line_items[0][price_data][currency]": "gbp",
    "line_items[0][price_data][product_data][name]": `${inv.number}: ${inv.description}`.slice(0, 120),
    "line_items[0][price_data][unit_amount]": String(Math.round(Number(inv.amount_gbp) * 100)),
    "line_items[0][quantity]": "1",
    client_reference_id: inv.id,
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/f/paid`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/f/paid?cancelled=1`,
  });
  if (inv.email) p.set("customer_email", inv.email);
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" }, body: p });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message ?? `Stripe ${r.status}`);
  return { url: j.url as string, sessionId: j.id as string };
}

/** Verifies a Stripe-Signature header (t=...,v1=...) against STRIPE_WEBHOOK_SECRET, with a 5 minute tolerance. */
export function verifyStripe(raw: string, header: string | null) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  if (!parts.t || !parts.v1 || Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${parts.t}.${raw}`).digest("hex");
  const a = Buffer.from(parts.v1), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
