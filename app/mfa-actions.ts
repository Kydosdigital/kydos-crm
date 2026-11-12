"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

export type EnrolState = { factorId?: string; qr?: string; secret?: string; error?: string; done?: boolean } | null;

const cleanCode = (v: FormDataEntryValue | null) => String(v ?? "").replace(/\D/g, "").slice(0, 6);

/** Starts authenticator-app setup. Any half-finished attempt is cleared first. */
export async function enrolMfa(): Promise<EnrolState> {
  const db = await supabaseServer();
  const { data: list } = await db.auth.mfa.listFactors();
  for (const f of list?.all ?? []) if (f.factor_type === "totp" && f.status === "unverified") await db.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await db.auth.mfa.enroll({ factorType: "totp", friendlyName: `Kydos CRM ${Date.now().toString(36)}`, issuer: "Kydos CRM" });
  if (error || !data) return { error: error?.message ?? "Could not start setup." };
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/** Confirms the first code from the authenticator app and switches two-factor on. */
export async function confirmMfa(prev: EnrolState, fd: FormData): Promise<EnrolState> {
  const db = await supabaseServer();
  const factorId = String(fd.get("factor_id") ?? "");
  const { error } = await db.auth.mfa.challengeAndVerify({ factorId, code: cleanCode(fd.get("code")) });
  if (error) return { ...prev, error: "That code was not right. Check the time on your phone and try the next code." };
  revalidatePath("/account");
  return { done: true };
}

export async function disableMfa() {
  const db = await supabaseServer();
  const { data: list } = await db.auth.mfa.listFactors();
  for (const f of list?.all ?? []) if (f.factor_type === "totp") {
    const { error } = await db.auth.mfa.unenroll({ factorId: f.id });
    if (error) redirect("/account?error=" + encodeURIComponent(error.message));
  }
  redirect("/account?msg=" + encodeURIComponent("Two-factor sign-in is off."));
}

/** Second step of sign-in for accounts with two-factor on. */
export async function verifyLogin(fd: FormData) {
  const db = await supabaseServer();
  const { data: list } = await db.auth.mfa.listFactors();
  const factor = list?.totp?.[0];
  if (!factor) redirect("/");
  const { error } = await db.auth.mfa.challengeAndVerify({ factorId: factor.id, code: cleanCode(fd.get("code")) });
  if (error) redirect("/auth/mfa?error=" + encodeURIComponent("That code was not right. Try the current one from your authenticator app."));
  redirect("/");
}
