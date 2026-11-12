import { supabaseAdmin } from "@/lib/supabase/admin";
import { notifyOwner } from "@/lib/notify";
import { fireTrigger } from "@/lib/automation";
import { logActivity } from "@/lib/log";

// Client accepts or declines from their private link (no login). Typed name, time and IP are stored as the acceptance record.
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const fd = await req.formData();
  const db = supabaseAdmin();
  const accept = fd.get("action") === "accept";
  const name = String(fd.get("name") ?? "").trim().slice(0, 120);
  if (accept && (!name || fd.get("agree") !== "on")) return new Response("Name and agreement are required", { status: 400 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const { data: p } = await db.from("proposals").update({
    status: accept ? "accepted" : "declined", responded_at: new Date().toISOString(),
    signed_name: accept ? name : null, signed_ip: accept ? ip : null, decline_reason: accept ? null : String(fd.get("reason") ?? "").trim().slice(0, 500) || null,
  }).eq("token", token).in("status", ["sent", "viewed"]).select("*").maybeSingle();
  if (p) {
    const tag = accept ? "proposal-accepted" : "proposal-declined";
    const { data: c } = await db.from("contacts").select("tags").eq("id", p.contact_id).single();
    if (c && !(c.tags ?? []).includes(tag)) await db.from("contacts").update({ tags: [...(c.tags ?? []), tag] }).eq("id", p.contact_id);
    await db.from("notes").insert({ workspace_id: p.workspace_id, contact_id: p.contact_id, body: accept ? `Proposal "${p.title}" accepted by ${name}` : `Proposal "${p.title}" declined${p.decline_reason ? `: ${p.decline_reason}` : ""}` });
    await fireTrigger(p.workspace_id, p.contact_id, { type: "tag_added", tag });
    if (accept) await fireTrigger(p.workspace_id, p.contact_id, { type: "proposal_accepted" });
    await notifyOwner(p.workspace_id, accept ? "Proposal ACCEPTED" : "Proposal declined", `${p.title}${accept ? ` accepted by ${name}` : ""}`);
    await logActivity(p.workspace_id, "client", accept ? "proposal accepted" : "proposal declined", "proposal", p.id);
  }
  return Response.redirect(new URL(`/f/proposal/${token}`, process.env.NEXT_PUBLIC_APP_URL ?? req.url), 303);
}
