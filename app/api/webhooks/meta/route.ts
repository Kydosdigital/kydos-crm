import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { toE164 } from "@/lib/messaging";
import { fireTrigger } from "@/lib/automation";
import { notifyOwner } from "@/lib/notify";
import { sendMetaEvent } from "@/lib/capi";
import { receiveSocialDM } from "@/lib/social";

// Meta app -> Webhooks. Callback URL: <app>/api/webhooks/meta, verify token = META_VERIFY_TOKEN.
// Subscribe: Page > leadgen (Facebook lead forms); WhatsApp Business Account > messages (inbound replies and delivery status).
// Env: META_VERIFY_TOKEN, META_APP_SECRET, META_PAGE_TOKEN (page access token with leads_retrieval), MCP_WORKSPACE_SLUG.

export function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get("hub.mode") === "subscribe" && u.searchParams.get("hub.verify_token") === process.env.META_VERIFY_TOKEN) {
    return new Response(u.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

function validSignature(raw: string, header: string | null) {
  if (!process.env.META_APP_SECRET || !header) return false;
  const expected = "sha256=" + createHmac("sha256", process.env.META_APP_SECRET).update(raw).digest("hex");
  const a = Buffer.from(header), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

type LeadField = { name: string; values: string[] };

async function handleLead(wsId: string, leadgenId: string, formId?: string) {
  const db = supabaseAdmin();
  const r = await fetch(`https://graph.facebook.com/v23.0/${leadgenId}?access_token=${process.env.META_PAGE_TOKEN}`);
  const j = (await r.json()) as { field_data?: LeadField[]; error?: { message: string } };
  if (!r.ok || !j.field_data) {
    await notifyOwner(wsId, "Facebook lead could not be fetched", `Lead ${leadgenId}: ${j.error?.message ?? r.status}`);
    return;
  }
  const f = (...names: string[]) => j.field_data!.find((x) => names.includes(x.name.toLowerCase()))?.values?.[0]?.trim();
  const full = f("full_name", "name");
  const first = f("first_name") ?? full?.split(" ")[0];
  const last = f("last_name") ?? (full ? full.split(" ").slice(1).join(" ") : undefined);
  const email = f("email", "work_email")?.toLowerCase();
  const phone = toE164(f("phone_number", "phone", "work_phone_number"));
  const company = f("company_name", "company");
  if (!email && !phone) return;

  let q = db.from("contacts").select("id,tags").eq("workspace_id", wsId);
  q = email ? q.ilike("email", email) : q.eq("phone", phone!);
  const { data: existing } = await q.maybeSingle();
  let id = existing?.id as string | undefined;
  const isNew = !id;
  if (!id) {
    const { data } = await db.from("contacts").insert({
      workspace_id: wsId, first_name: first ?? null, last_name: last ?? null, email: email ?? null, phone, company: company ?? null,
      source: "facebook-lead-ad", tags: ["fb-lead"],
      consent_note: `Submitted Facebook lead form${formId ? ` ${formId}` : ""} at ${new Date().toISOString()}`,
    }).select("id").single();
    id = data?.id;
  } else if (!(existing!.tags ?? []).includes("fb-lead")) {
    await db.from("contacts").update({ tags: [...(existing!.tags ?? []), "fb-lead"] }).eq("id", id);
  }
  if (!id) return;
  await db.from("notes").insert({ workspace_id: wsId, contact_id: id, body: `Facebook lead ${leadgenId}: ${j.field_data.map((x) => `${x.name}=${x.values.join("/")}`).join("; ")}` });
  if (isNew) { await fireTrigger(wsId, id, { type: "contact_created" }); await sendMetaEvent(wsId, id, "Lead"); }
  await fireTrigger(wsId, id, { type: "form_submitted", form: "facebook" });
  await fireTrigger(wsId, id, { type: "tag_added", tag: "fb-lead" });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get("x-hub-signature-256"))) return new Response("Invalid signature", { status: 403 });
  const body = JSON.parse(raw);
  const db = supabaseAdmin();
  const { data: ws } = await db.from("workspaces").select("id").eq("slug", process.env.MCP_WORKSPACE_SLUG ?? "kydos-digital").single();
  if (!ws) return new Response("ok");

  for (const entry of body.entry ?? []) {
    // Messenger (object "page") and Instagram DMs (object "instagram") arrive as entry.messaging[]
    for (const ev of entry.messaging ?? []) {
      if (ev.message && !ev.message.is_echo && ev.sender?.id) {
        try { await receiveSocialDM(ws.id, body.object === "instagram" ? "instagram" : "messenger", String(ev.sender.id), ev.message.text ?? "[attachment]", ev.message.mid); } catch (e) { console.error("dm", e); }
      }
    }
    for (const ch of entry.changes ?? []) {
      if (ch.field === "leadgen") {
        try { await handleLead(ws.id, ch.value.leadgen_id, ch.value.form_id); } catch (e) { console.error("lead", e); }
      }
      if (ch.field === "messages") {
        const v = ch.value ?? {};
        for (const m of v.messages ?? []) {
          const phone = toE164("+" + String(m.from));
          let { data: c } = await db.from("contacts").select("id,sms_opt_out").eq("workspace_id", ws.id).eq("phone", phone!).maybeSingle();
          if (!c && phone) {
            const ins = await db.from("contacts").insert({ workspace_id: ws.id, phone, first_name: v.contacts?.[0]?.profile?.name ?? null, source: "inbound-whatsapp", tags: [] }).select("id,sms_opt_out").single();
            c = ins.data;
          }
          const text = m.text?.body ?? `[${m.type}]`;
          if (c) {
            await db.from("messages").insert({ workspace_id: ws.id, contact_id: c.id, channel: "whatsapp", direction: "in", body: text, status: "received", provider_id: m.id });
            if (/^\s*stop\s*$/i.test(text)) await db.from("contacts").update({ sms_opt_out: true }).eq("id", c.id);
          }
        }
        for (const s of v.statuses ?? []) {
          const map: Record<string, string> = { delivered: "delivered", read: "delivered", failed: "failed", sent: "sent" };
          if (s.status === "delivered" || s.status === "read") {
            const { data: wm } = await db.from("messages").select("id,contact_id").eq("provider_id", s.id).maybeSingle();
            if (wm) await db.from("message_events").insert({ workspace_id: ws.id, message_id: wm.id, contact_id: wm.contact_id, type: s.status });
          }
          if (map[s.status]) await db.from("messages").update({ status: map[s.status], ...(s.status === "failed" ? { error: s.errors?.[0]?.title } : {}) }).eq("provider_id", s.id);
        }
      }
    }
  }
  return new Response("ok");
}
