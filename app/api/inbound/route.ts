import { timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { toE164 } from "@/lib/messaging";
import { fireTrigger } from "@/lib/automation";

// Generic authenticated lead intake for Zapier, Make, Google Ads lead forms etc.
// POST JSON with header "Authorization: Bearer <INBOUND_API_KEY>":
// { first_name, last_name, email, phone, company, source, utm_source, utm_medium, utm_campaign, fbclid, gclid, tags: [], custom: {}, consent_note }
// Workspace is chosen by INBOUND_WORKSPACE_SLUG (default kydos-digital). Existing contacts (same email or phone) are updated, never duplicated.
export async function POST(req: Request) {
  const key = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const expected = process.env.INBOUND_API_KEY ?? "";
  const a = Buffer.from(key), b = Buffer.from(expected);
  if (!expected || a.length !== b.length || !timingSafeEqual(a, b)) return new Response("Unauthorized", { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return new Response("Invalid JSON", { status: 400 });
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() || null : null);
  const email = str("email")?.toLowerCase() ?? null;
  const phone = toE164(str("phone"));
  if (!email && !phone) return new Response("email or phone required", { status: 400 });

  const db = supabaseAdmin();
  const { data: ws } = await db.from("workspaces").select("id").eq("slug", process.env.INBOUND_WORKSPACE_SLUG ?? "kydos-digital").single();
  if (!ws) return new Response("Unknown workspace", { status: 404 });

  const tags = Array.isArray(body.tags) ? (body.tags as unknown[]).map(String).slice(0, 20) : [];
  const custom = body.custom && typeof body.custom === "object" ? (body.custom as Record<string, unknown>) : {};
  let q = db.from("contacts").select("id,tags,custom").eq("workspace_id", ws.id);
  q = email ? q.ilike("email", email) : q.eq("phone", phone!);
  const { data: existing } = await q.maybeSingle();
  let id = existing?.id as string | undefined;
  const isNew = !id;
  if (!id) {
    const { data } = await db.from("contacts").insert({
      workspace_id: ws.id, first_name: str("first_name"), last_name: str("last_name"), email, phone, company: str("company"),
      source: str("source") ?? "api", tags, custom,
      ...Object.fromEntries(["utm_source", "utm_medium", "utm_campaign", "utm_content", "fbclid", "gclid", "landing_url"].map((k) => [k, str(k)]).filter(([, v]) => v)), consent_note: str("consent_note") ?? "Submitted via inbound API",
    }).select("id").single();
    id = data?.id;
  } else {
    await db.from("contacts").update({ tags: Array.from(new Set([...(existing!.tags ?? []), ...tags])), custom: { ...(existing!.custom ?? {}), ...custom } }).eq("id", id);
  }
  if (!id) return new Response("error", { status: 500 });
  if (isNew) await fireTrigger(ws.id, id, { type: "contact_created" });
  for (const t of tags) await fireTrigger(ws.id, id, { type: "tag_added", tag: t });
  return Response.json({ id, created: isNew });
}
