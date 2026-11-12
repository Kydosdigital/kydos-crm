import { supabaseServer } from "@/lib/supabase/server";
import { getWorkspaces, currentRole } from "@/lib/workspace";

const esc = (v: unknown) => {
  let t = v == null ? "" : Array.isArray(v) ? v.join("; ") : String(v);
  if (/^[=+\-@]/.test(t)) t = "'" + t; // stop spreadsheet formula injection
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

// GET /api/contacts/export?q=&tag=  Signed-in members only (row level security does the filtering).
export async function GET(req: Request) {
  const db = await supabaseServer();
  const { data: u } = await db.auth.getUser();
  if (!u.user) return new Response("Sign in first", { status: 401 });
  const { active } = await getWorkspaces();
  if (!active) return new Response("No business", { status: 404 });
  if ((await currentRole(active.id)) === "client") return new Response("Not available to client logins", { status: 403 });
  const sp = new URL(req.url).searchParams;
  const q = sp.get("q")?.replace(/[,()%]/g, " "), tag = sp.get("tag");
  let query = db.from("contacts").select("*").eq("workspace_id", active.id).order("created_at", { ascending: false }).limit(20000);
  if (q) query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,company.ilike.%${q}%`);
  if (tag) query = query.contains("tags", [tag]);
  const { data } = await query;
  const cols = ["first_name", "last_name", "email", "phone", "company", "source", "tags", "utm_source", "utm_medium", "utm_campaign", "email_opt_out", "sms_opt_out", "created_at"];
  const csv = [cols.join(","), ...(data ?? []).map((r) => cols.map((c) => esc((r as Record<string, unknown>)[c])).join(","))].join("\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="contacts-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
