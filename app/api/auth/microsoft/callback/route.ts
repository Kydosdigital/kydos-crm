import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encrypt, exchangeCode, graphMe } from "@/lib/outlook";
import { currentRole } from "@/lib/workspace";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (msg: string) => NextResponse.redirect(new URL(`/settings?error=${encodeURIComponent(msg)}`, url));
  const jar = await cookies();
  const state = jar.get("ms_state")?.value;
  const wsId = jar.get("ms_ws")?.value;
  const code = url.searchParams.get("code");
  if (url.searchParams.get("error")) return back(url.searchParams.get("error_description") ?? "Microsoft sign-in was cancelled");
  if (!code || !state || state !== url.searchParams.get("state") || !wsId) return back("Sign-in link expired, please try again");

  const db = await supabaseServer();
  const { data: user } = await db.auth.getUser();
  if (!user.user) return NextResponse.redirect(new URL("/login", url));
  const { data: ws } = await db.from("workspaces").select("id").eq("id", wsId).maybeSingle(); // RLS: members only
  if (!ws) return back("Workspace not found");
  const role = await currentRole(ws.id);
  if (role !== "owner" && role !== "admin" && role !== "member") return back("Only staff can connect a mailbox");

  try {
    const t = await exchangeCode(code);
    if (!t.refresh_token) return back("Microsoft did not return a refresh token");
    const account = await graphMe(t.access_token);
    await supabaseAdmin().from("mail_connections").upsert({
      workspace_id: ws.id, account_email: account, refresh_token_enc: encrypt(t.refresh_token), last_synced_at: null,
    });
  } catch (e) {
    return back(String(e));
  }
  const res = NextResponse.redirect(new URL("/settings?connected=outlook", url));
  res.cookies.delete("ms_state");
  res.cookies.delete("ms_ws");
  return res;
}
