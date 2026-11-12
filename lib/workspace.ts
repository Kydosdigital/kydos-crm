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
