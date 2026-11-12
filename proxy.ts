import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase session and sends signed-out visitors to /login.
// Webhooks, cron, public forms and unsubscribe links are excluded by the matcher.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  const { data } = await supabase.auth.getUser();
  if (!data.user && !["/login", "/signup"].some((p) => request.nextUrl.pathname.startsWith(p))) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (data.user && !["/login", "/signup"].some((p) => request.nextUrl.pathname.startsWith(p))) {
    // Accounts with two-factor on must finish the code step before they reach anything else.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") return NextResponse.redirect(new URL("/auth/mfa", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!api/|u/|f/|auth/|_next/|favicon.ico).*)"],
};
