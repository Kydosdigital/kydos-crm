import { supabaseServer } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";

const safe = (n: string | null, fallback = "/contacts") =>
  n && n.startsWith("/") && !n.startsWith("//") && !/[\\\r\n]/.test(n) ? n : fallback;

// Step 1 (GET): show a Continue button, so email security scanners that pre-open links do not use up the one-time token.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const q = u.searchParams;
  const html = `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><body style="font-family:system-ui;max-width:360px;margin:96px auto;padding:0 16px;text-align:center"><h1 style="font-size:20px">Kydos CRM</h1><p>Click to continue.</p><form method=post action="/auth/confirm"><input type=hidden name=token_hash value="${(q.get("token_hash") ?? "").replace(/[^\w-]/g, "")}"><input type=hidden name=type value="${(q.get("type") ?? "").replace(/[^\w]/g, "")}"><input type=hidden name=next value="${safe(q.get("next"), q.get("type") === "email" ? "/onboarding" : "/contacts").replace(/[^\w/-]/g, "")}"><button style="background:#0e5a48;color:#fff;border:0;padding:12px 28px;border-radius:6px;font-size:16px;cursor:pointer">Continue</button></form></body>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// Step 2 (POST): exchange the token for a session, then go to the page asked for.
export async function POST(req: Request) {
  const base = () => new URL(req.url).origin;
  const fd = await req.formData();
  const db = await supabaseServer();
  const { error } = await db.auth.verifyOtp({ token_hash: String(fd.get("token_hash")), type: String(fd.get("type")) as EmailOtpType });
  if (error) return Response.redirect(new URL("/login?error=" + encodeURIComponent("That link has expired or was already used. Request a new one. (" + error.message + ")"), base()), 303);
  return Response.redirect(new URL(safe(String(fd.get("next")), String(fd.get("type")) === "email" ? "/onboarding" : "/contacts"), base()), 303);
}
