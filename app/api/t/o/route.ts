import { fireTrigger } from "@/lib/automation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyOpen } from "@/lib/tracking";

const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

// Open pixel. Apple Mail Privacy Protection and some gateways pre-fetch it, so opens are indicative only; clicks and replies are the real signals.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const m = q.get("m") ?? "", s = q.get("s") ?? "";
  // Unsigned or forged pixel requests are ignored, so opens cannot be faked for a known message ID.
  if (/^[0-9a-f-]{36}$/.test(m) && verifyOpen(m, s)) {
    try {
      const db = supabaseAdmin();
      const { data: msg } = await db.from("messages").select("workspace_id,contact_id,created_at").eq("id", m).maybeSingle();
      if (msg) {
        const ua = req.headers.get("user-agent") ?? "";
        const machine = Date.now() - new Date(msg.created_at).getTime() < 8000 || ua === "";
        await db.from("message_events").insert({ workspace_id: msg.workspace_id, message_id: m, contact_id: msg.contact_id, type: "opened", machine });
        if (!machine) await fireTrigger(msg.workspace_id, msg.contact_id, { type: "email_opened" });
      }
    } catch {}
  }
  return new Response(GIF, { headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, max-age=0" } });
}
