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
  // A provider outage or malformed code must not become an unhandled 500.
  // Never log the single-use code, verifier, session or provider response.
  try {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error)
      return NextResponse.redirect(new URL("/login?error=verify", url.origin));
  } catch {
    return NextResponse.redirect(new URL("/login?error=verify", url.origin));
  }

  return NextResponse.redirect(new URL(destination, url.origin));
}
