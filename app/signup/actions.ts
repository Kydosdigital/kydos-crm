"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createAccount(form: FormData) {
  // Keep credentials in the server action. Never put passwords in query strings,
  // logs, user_metadata or emails.
  const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ");
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const confirmation = String(form.get("confirm_password") ?? "");

  // Honeypot is deliberately silent, with no Auth calls made for obvious bots.
  if (form.get("website")) redirect("/signup?status=check");

  if (name.length < 2 || name.length > 80 || !EMAIL.test(email) || email.length > 254)
    redirect("/signup?error=details");
  if (password.length < 10 || password.length > 128)
    redirect("/signup?error=password");
  if (password !== confirmation)
    redirect("/signup?error=mismatch");

  // Only trusted deployment configuration may determine the email callback URL.
  // Do not accept arbitrary origins, invite tokens or workspace IDs from users.
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (!configured) redirect("/signup?error=unavailable");
  let base: URL;
  try {
    base = new URL(configured);
  } catch {
    redirect("/signup?error=unavailable");
  }
  if (base.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && base.hostname === "localhost"))
    redirect("/signup?error=unavailable");
  const callback = new URL("/auth/callback?next=%2Fonboarding", base);

  const supabase = await supabaseServer();
  let result: Awaited<ReturnType<typeof supabase.auth.signUp>>;
  try {
    result = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: callback.toString(),
        // Display information only. Never use mutable user_metadata for roles.
        data: { full_name: name },
      },
    });
  } catch {
    // Provider/network failure. Never log user credentials or email.
    redirect("/signup?error=unavailable");
  }
  const { data, error } = result;

  if (error) {
    // Keep untrusted provider messages and email-existence details off the UI.
    if (error.status === 429 || error.code === "over_email_send_rate_limit")
      redirect("/signup?error=limited");
    if (error.code === "weak_password") redirect("/signup?error=password");
    redirect("/signup?error=unavailable");
  }

  if (data.session) {
    // This occurs if email confirmations are switched off in Supabase.
    // It grants NO workspace membership. Send them to the restricted
    // onboarding screen rather than assuming they are an admin.
    redirect("/onboarding");
  }

  // Supabase may deliberately obfuscate an already-registered email here.
  // Do not reveal account existence in the public confirmation notice.
  redirect("/signup?status=check");
}
