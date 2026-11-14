import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

const NEXT = new Set(["/onboarding", "/contacts"]);

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const destination = NEXT.has(next ?? "") ? next! : "/onboarding";

  if (!code || code.length > 2048)
    return NextResponse.redirect(new URL("/signup?error=unavailable", url.origin));

  // PKCE verifier remains in the Supabase SSR cookies from signUp.
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error)
    return NextResponse.redirect(new URL("/login?error=verify", url.origin));

  return NextResponse.redirect(new URL(destination, url.origin));
}
