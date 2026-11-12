import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyClick } from "@/lib/tracking";

// Click tracking redirect. Signed so it cannot be used as an open redirect.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const m = q.get("m") ?? "", u = q.get("u") ?? "", s = q.get("s") ?? "";
  if (!m || !/^https?:\/\//.test(u) || !verifyClick(m, u, s)) return new Response("Not found", { status: 404 });
  try {
    const db = supabaseAdmin();
    const { data: msg } = await db.from("messages").select("workspace_id,contact_id,created_at").eq("id", m).maybeSingle();
    if (msg) {
      const machine = Date.now() - new Date(msg.created_at).getTime() < 8000; // link scanners hit within seconds
      await db.from("message_events").insert({ workspace_id: msg.workspace_id, message_id: m, contact_id: msg.contact_id, type: "clicked", url: u, machine });
    }
  } catch {}
  return Response.redirect(u, 302);
}
