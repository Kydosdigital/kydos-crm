import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { toE164 } from "@/lib/messaging";
import { fireTrigger } from "@/lib/automation";
import { sendMetaEvent } from "@/lib/capi";
import { logActivity } from "@/lib/log";


// Blank strings from HTML forms count as "not provided".
const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const opt = (max: number) => z.preprocess(blankToUndefined, z.string().max(max).optional());

const MAX_BODY_BYTES = 16 * 1024;
const HONEYPOT_FIELD = "kd_hp_contact"; // hidden from humans; bots tend to fill it in

const schema = z.object({
  workspace: z.string().min(1).max(100),   // workspace slug
  first_name: opt(120),
  last_name: opt(120),
  email: z.preprocess(blankToUndefined, z.string().trim().max(254).email().optional()),
  phone: opt(40),
  company: opt(200),
  consent: z.boolean().optional(),         // tick-box on your form; stored as consent evidence
  custom: z.record(z.string().max(100), z.string().max(2000)).refine((c) => Object.keys(c).length <= 50, "Too many fields").optional(), // extra fields from hosted forms
  page: opt(500),
  attribution: z.record(z.string().max(100), z.string().max(500)).optional(), // utm_*, fbclid, gclid, landing_url
  [HONEYPOT_FIELD]: z.unknown().optional(),
});

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type" };
export const OPTIONS = () => new Response(null, { headers: cors });

// POST JSON from any website form: /api/forms/contact-us  { workspace: "kydos", email: "...", ... }
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return Response.json({ error: "Payload too large" }, { status: 413, headers: cors });
  const raw = await req.text().catch(() => "");
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return Response.json({ error: "Payload too large" }, { status: 413, headers: cors });
  let body: unknown = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return Response.json({ error: "Invalid payload" }, { status: 400, headers: cors });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid payload" }, { status: 400, headers: cors });
  const f = parsed.data;
  // Honeypot: a filled hidden field means a bot. Pretend success, store nothing.
  if (f[HONEYPOT_FIELD] !== undefined && String(f[HONEYPOT_FIELD]).trim() !== "") {
    return Response.json({ ok: true }, { headers: cors });
  }
  if (!f.email && !f.phone) return Response.json({ error: "Email or phone required" }, { status: 400, headers: cors });
  const phone = toE164(f.phone);
  if (f.phone && !phone) return Response.json({ error: "Invalid phone number" }, { status: 400, headers: cors });

  const db = supabaseAdmin();
  const { data: ws } = await db.from("workspaces").select("id").eq("slug", f.workspace).maybeSingle();
  if (!ws) return Response.json({ error: "Unknown workspace" }, { status: 404, headers: cors });

  const { data: hf } = await db.from("hosted_forms").select("id,tags,submissions").eq("workspace_id", ws.id).eq("slug", slug).maybeSingle();
  let q = db.from("contacts").select("id").eq("workspace_id", ws.id);
  // Escape LIKE wildcards so an email such as "%@" cannot match other contacts.
  q = f.email ? q.ilike("email", f.email.replace(/[\\%_]/g, (c) => `\\${c}`)) : q.eq("phone", phone!);
  const { data: existing } = await q.maybeSingle();

  const at = f.attribution ?? {};
  const attr = Object.fromEntries(["utm_source", "utm_medium", "utm_campaign", "utm_content", "fbclid", "gclid", "landing_url"].filter((k) => at[k]).map((k) => [k, at[k].slice(0, 500)]));
  let contactId = existing?.id as string | undefined;
  const isNew = !contactId;
  if (!contactId) {
    const { data } = await db
      .from("contacts")
      .insert({
        workspace_id: ws.id,
        first_name: f.first_name,
        last_name: f.last_name,
        email: f.email,
        phone,
        company: f.company,
        source: `form:${slug}`,
        ...attr,
        tags: Array.from(new Set([`form-${slug}`, ...(hf?.tags ?? [])])),
        custom: f.custom ?? {},
        consent_note: f.consent ? `Ticked consent on form "${slug}" at ${new Date().toISOString()}` : null,
      })
      .select("id")
      .single();
    contactId = data?.id;
  }
  if (!contactId) return Response.json({ error: "Could not save" }, { status: 500, headers: cors });

  if (!isNew && f.custom && Object.keys(f.custom).length) {
    const { data: cur } = await db.from("contacts").select("custom").eq("id", contactId).single();
    await db.from("contacts").update({ custom: { ...(cur?.custom ?? {}), ...f.custom } }).eq("id", contactId);
  }
  if (f.custom?.message) await db.from("notes").insert({ workspace_id: ws.id, contact_id: contactId, body: `Form "${slug}"${f.page ? ` (${f.page})` : ""}: ${f.custom.message}` });
  if (hf) await db.from("hosted_forms").update({ submissions: (hf.submissions ?? 0) + 1 }).eq("id", hf.id);
  await logActivity(ws.id, "form", "form_submitted", "contact", contactId, slug);
  if (isNew) await sendMetaEvent(ws.id, contactId, "Lead");
  if (isNew) await fireTrigger(ws.id, contactId, { type: "contact_created" });
  await fireTrigger(ws.id, contactId, { type: "form_submitted", form: slug });
  return Response.json({ ok: true }, { headers: cors });
}
