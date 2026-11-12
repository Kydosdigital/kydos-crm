import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { toE164 } from "@/lib/messaging";
import { fireTrigger } from "@/lib/automation";
import { sendMetaEvent } from "@/lib/capi";
import { logActivity } from "@/lib/log";


const schema = z.object({
  workspace: z.string().min(1),            // workspace slug
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  consent: z.boolean().optional(),         // tick-box on your form; stored as consent evidence
  custom: z.record(z.string(), z.string()).optional(), // extra fields from hosted forms
  page: z.string().optional(),
});

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type" };
export const OPTIONS = () => new Response(null, { headers: cors });

// POST JSON from any website form: /api/forms/contact-us  { workspace: "kydos", email: "...", ... }
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid payload" }, { status: 400, headers: cors });
  const f = parsed.data;
  if (!f.email && !f.phone) return Response.json({ error: "Email or phone required" }, { status: 400, headers: cors });

  const db = supabaseAdmin();
  const { data: ws } = await db.from("workspaces").select("id").eq("slug", f.workspace).maybeSingle();
  if (!ws) return Response.json({ error: "Unknown workspace" }, { status: 404, headers: cors });

  const { data: hf } = await db.from("hosted_forms").select("id,tags,submissions").eq("workspace_id", ws.id).eq("slug", slug).maybeSingle();
  const phone = toE164(f.phone);
  let q = db.from("contacts").select("id").eq("workspace_id", ws.id);
  q = f.email ? q.ilike("email", f.email) : q.eq("phone", phone!);
  const { data: existing } = await q.maybeSingle();

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
