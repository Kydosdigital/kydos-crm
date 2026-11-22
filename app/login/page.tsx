import Link from "next/link";
import { ArrowRight, KeyRound } from "lucide-react";
import { login, requestLink } from "../actions";
import { AuthShell, PublicHeading } from "@/components/shell/public-shell";
import { Alert, Field } from "@/components/ui";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string }> }) {
  const { error, sent } = await searchParams;
  return (
    <AuthShell>
      <PublicHeading title="Welcome back">Sign in with a one-time link sent to your email. No password needed.</PublicHeading>
      {error && <Alert tone="danger">{error}</Alert>}
      {sent && <Alert tone="neutral">If your address has an account and email delivery is available, a sign-in link should arrive shortly. Check spam too. If nothing arrives, use password sign-in or contact your CRM administrator.</Alert>}
      <form action={requestLink} className="flex flex-col gap-3">
        <Field label="Work email">
          <input name="email" type="email" placeholder="you@company.co.uk" autoComplete="email" required className="input !h-11 !text-sm" />
        </Field>
        <button name="kind" value="login" className="btn btn-primary btn-lg w-full">Email me a sign-in link<ArrowRight /></button>
        <button name="kind" value="reset" className="btn btn-ghost w-full">Set or reset password</button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-faint"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>

      <details className="disclosure card p-4">
        <summary className="text-[13px]"><KeyRound className="h-4 w-4 text-muted" aria-hidden />Sign in with a password</summary>
        <form action={login} className="mt-4 flex flex-col gap-3">
          <Field label="Email"><input name="email" type="email" placeholder="you@company.co.uk" autoComplete="email" required className="input" /></Field>
          <Field label="Password"><input name="password" type="password" placeholder="Your password" autoComplete="current-password" required className="input" /></Field>
          <button className="btn btn-secondary w-full">Sign in</button>
        </form>
      </details>

      <p className="mt-8 text-center text-[13px] text-muted">New here? <Link href="/signup" className="link">Request access</Link></p>
    </AuthShell>
  );
}
