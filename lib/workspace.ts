import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase/server";

export type Ws = {
  id: string;
  name: string;
  slug: string;
  email_from: string | null;
  sms_from: string | null;
  whatsapp_from: string | null;
  business_address: string | null;
  notify_email: string | null;
  agent_mode: string;
  booking_link: string | null;
  review_link: string | null;
  meta_dataset_id: string | null;
  brand_color: string | null;
  logo_url: string | null;
  email_signature: string | null;
  reply_to: string | null;
  website_url: string | null;
  call_number: string | null;
  call_forward_number: string | null;
  missed_call_template: string | null;
  missed_call_text: string | null;
};

/** Returns the signed-in user's workspaces and the active one (from the `ws` cookie, else the first). */
export async function getWorkspaces() {
  const db = await supabaseServer();
  const { data } = await db.from("workspaces").select("*").order("name");
  const all = (data ?? []) as Ws[];
  const wanted = (await cookies()).get("ws")?.value;
  const active = all.find((w) => w.id === wanted) ?? all[0] ?? null;
  return { all, active };
}

export async function requireWorkspace() {
  const { all, active } = await getWorkspaces();
  if (!active) redirect("/settings");
  return { all, ws: active };
}

/**
 * The signed-in user's role in the active workspace.
 * Fails closed: a missing user, missing membership, unknown role or query error
 * returns "client" (the most restricted role), never an elevated member role.
 */
export async function currentRole(wsId: string): Promise<"owner" | "admin" | "member" | "client"> {
  const FALLBACK = "client" as const;
  const db = await supabaseServer();
  const { data: u, error: userErr } = await db.auth.getUser();
  const userId = u?.user?.id;
  if (userErr || !userId) return FALLBACK;
  const { data, error } = await db.from("workspace_members").select("role").eq("workspace_id", wsId).eq("user_id", userId).maybeSingle();
  if (error) return FALLBACK;
  const role = data?.role;
  if (role === "owner" || role === "admin" || role === "member" || role === "client") return role;
  return FALLBACK;
}

/** Owners and admins only: settings, team, automations, forms, deletions. Members get redirected with a message. */
export async function requireAdmin() {
  const r = await requireWorkspace();
  const role = await currentRole(r.ws.id);
  if (role !== "owner" && role !== "admin") redirect("/contacts?error=" + encodeURIComponent("That needs an admin. Ask the account owner."));
  return { ...r, role };
}

/** Staff only (owner, admin, member). Clients have a read-only view, so any action that changes data is refused for them. */
export async function requireStaff() {
  const r = await requireWorkspace();
  const role = await currentRole(r.ws.id);
  if (role === "client") redirect("/contacts?error=" + encodeURIComponent("Your login is view only."));
  return { ...r, role };
}
