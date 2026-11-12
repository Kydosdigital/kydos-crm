import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { supabaseServer } from "@/lib/supabase/server";
import { getWorkspaces } from "@/lib/workspace";
import { authUrl } from "@/lib/outlook";

export async function GET(req: Request) {
  const { data } = await (await supabaseServer()).auth.getUser();
  if (!data.user) return NextResponse.redirect(new URL("/login", req.url));
  const { active } = await getWorkspaces();
  if (!active) return NextResponse.redirect(new URL("/settings", req.url));
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authUrl(state));
  const opts = { httpOnly: true, secure: true, sameSite: "lax" as const, maxAge: 600, path: "/" };
  res.cookies.set("ms_state", state, opts);
  res.cookies.set("ms_ws", active.id, opts);
  return res;
}
