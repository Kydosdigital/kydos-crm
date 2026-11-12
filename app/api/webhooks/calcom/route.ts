import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fireTrigger } from "@/lib/automation";
import { notifyOwner } from "@/lib/notify";

// Cal.com -> Settings -> Developer -> Webhooks: URL .../api/webhooks/calcom?ws=<workspace slug>, secret = CALCOM_WEBHOOK_SECRET.
// BOOKING_CREATED adds tag "booked"; BOOKING_CANCELLED adds "booking-cancelled"; BOOKING_RESCHEDULED re-adds "booked".
export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get("x-cal-signature-256") ?? "";
  const expected = createHmac("sha256", process.env.CALCOM_WEBHOOK_SECRET ?? "").update(raw).digest("hex");
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (!process.env.CALCOM_WEBHOOK_SECRET || a.length !== b.length || !timingSafeEqual(a, b)) return new Response("Invalid signature", { status: 403 });

  const slug = new URL(req.url).searchParams.get("ws");
  const db = supabaseAdmin();
  const { data: ws } = await db.from("workspaces").select("id").eq("slug", slug ?? "").maybeSingle();
  if (!ws) return new Response("Unknown workspace", { status: 404 });

  const ev = JSON.parse(raw) as { triggerEvent: string; payload?: { title?: string; startTime?: string; attendees?: { name?: string; email?: string }[] } };
  const att = ev.payload?.attendees?.[0];
  if (!att?.email) return new Response("ok");
  const tag = ev.triggerEvent === "BOOKING_CANCELLED" ? "booking-cancelled" : ev.triggerEvent === "BOOKING_CREATED" || ev.triggerEvent === "BOOKING_RESCHEDULED" ? "booked" : null;
  if (!tag) return new Response("ok");

  let { data: c } = await db.from("contacts").select("id,tags").eq("workspace_id", ws.id).ilike("email", att.email).maybeSingle();
  if (!c) {
    const [first, ...rest] = (att.name ?? "").split(" ");
    const ins = await db.from("contacts").insert({ workspace_id: ws.id, first_name: first || null, last_name: rest.join(" ") || null, email: att.email.toLowerCase(), source: "calcom", tags: [], consent_note: "Booked via Cal.com" }).select("id,tags").single();
    c = ins.data;
    if (c) await fireTrigger(ws.id, c.id, { type: "contact_created" });
  }
  if (!c) return new Response("error", { status: 500 });
  const tags = Array.from(new Set([...(c.tags ?? []).filter((t: string) => !(tag === "booked" && t === "booking-cancelled")), tag]));
  await db.from("contacts").update({ tags }).eq("id", c.id);
  await db.from("notes").insert({ workspace_id: ws.id, contact_id: c.id, body: `${ev.triggerEvent}: ${ev.payload?.title ?? ""} ${ev.payload?.startTime ?? ""}`.trim() });
  await fireTrigger(ws.id, c.id, { type: "tag_added", tag });
  await notifyOwner(ws.id, `${ev.triggerEvent.replace("BOOKING_", "Booking ").toLowerCase()}: ${att.name ?? att.email}`, `${ev.payload?.title ?? ""}\n${ev.payload?.startTime ?? ""}`);
  return new Response("ok");
}
