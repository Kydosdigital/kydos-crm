import { createHash } from "crypto";
import { supabaseAdmin } from "./supabase/admin";

const sha = (v: string) => createHash("sha256").update(v.trim().toLowerCase()).digest("hex");

/**
 * Meta Conversions API. Sends server-side events (Lead, Schedule, Purchase) so ads optimise on real results.
 * Needs workspaces.meta_dataset_id (Settings) and META_CAPI_TOKEN (falls back to META_PAGE_TOKEN). No-op until both exist.
 */
export async function sendMetaEvent(workspaceId: string, contactId: string, eventName: "Lead" | "Schedule" | "Purchase" | "Contact", value?: number) {
  try {
    const token = process.env.META_CAPI_TOKEN ?? process.env.META_PAGE_TOKEN;
    if (!token) return;
    const db = supabaseAdmin();
    const { data: ws } = await db.from("workspaces").select("meta_dataset_id").eq("id", workspaceId).single();
    if (!ws?.meta_dataset_id) return;
    const { data: c } = await db.from("contacts").select("email,phone,first_name,last_name,fbclid,landing_url,created_at").eq("id", contactId).single();
    if (!c) return;
    const user_data: Record<string, string[] | string> = {};
    // fbc ties the event back to the exact ad click, which improves match quality a lot
    if (c.fbclid) user_data.fbc = `fb.1.${Date.parse(c.created_at ?? "") || Date.now()}.${c.fbclid}`;
    if (c.email) user_data.em = [sha(c.email)];
    if (c.phone) user_data.ph = [sha(c.phone.replace(/\D/g, ""))];
    if (c.first_name) user_data.fn = [sha(c.first_name)];
    if (c.last_name) user_data.ln = [sha(c.last_name)];
    const event_id = `${contactId}-${eventName}-${Math.floor(Date.now() / 3_600_000)}`; // dedupes retries within the hour
    const body = {
      data: [{ event_name: eventName, event_time: Math.floor(Date.now() / 1000), event_id, action_source: c.fbclid ? "website" : "system_generated", ...(c.landing_url ? { event_source_url: c.landing_url } : {}), user_data, ...(value ? { custom_data: { value, currency: "GBP" } } : {}) }],
    };
    const r = await fetch(`https://graph.facebook.com/v23.0/${ws.meta_dataset_id}/events?access_token=${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    await db.from("activity_log").insert({ workspace_id: workspaceId, actor: "system", action: `meta_capi_${eventName.toLowerCase()}`, entity: "contact", entity_id: contactId, detail: r.ok ? "sent" : `failed ${r.status}` });
  } catch { /* never block the main flow */ }
}
