import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import { logout } from "../../actions";
import { verifyLogin } from "../../mfa-actions";
import { AuthShell, PublicHeading } from "@/components/shell/public-shell";
import { Alert, Field } from "@/components/ui";

export default async function MfaChallenge({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const db = await supabaseServer();
  const { data: u } = await db.auth.getUser();
  if (!u.user) redirect("/login");
  const { data: aal } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2" || aal?.nextLevel !== "aal2") redirect("/");
  return (
    <AuthShell>
      <PublicHeading title="Two-factor check">Enter the 6-digit code from your authenticator app to finish signing in.</PublicHeading>
      {error && <Alert tone="danger">{error}</Alert>}
      <form action={verifyLogin} className="flex flex-col gap-3">
        <Field label="Authentication code">
          <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} placeholder="123456" required autoFocus className="input !h-11 !text-center !text-lg !tracking-[0.3em] tabular" />
        </Field>
        <button className="btn btn-primary btn-lg w-full"><ShieldCheck aria-hidden />Verify</button>
      </form>
      <form action={logout} className="mt-6 text-center"><button className="btn btn-ghost btn-sm">Use a different account</button></form>
    </AuthShell>
  );
}
