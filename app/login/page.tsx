import Link from "next/link";
import { ArrowRight, KeyRound, Mail } from "lucide-react";
import { login, requestLink } from "../actions";
import { AuthShell, PublicHeading } from "@/components/shell/public-shell";
import { Alert, Field } from "@/components/ui";

const ERRORS: Record<string, string> = {
  invalid: "We couldn't sign you in. Check your email and password.",
  verify: "Please verify your email address using the link sent when you registered.",
  limited: "Too many sign-in attempts. Please try again later.",
};

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await searchParams;
  return (
    <AuthShell>
      <PublicHeading title="Welcome back">
        Sign in with your email and password, or use a one-time email link.
      </PublicHeading>
      {error && <Alert tone="danger">{ERRORS[error] ?? "We couldn't sign you in. Please try again."}</Alert>}
      {sent && <Alert tone="neutral">
        If your account exists and email delivery is available, a link should arrive shortly.
        Check spam too. Password sign-in works without waiting for an email.
      </Alert>}
      <form action={login} className="flex flex-col gap-3">
        <Field label="Email">
          <input name="email" type="email" placeholder="you@company.co.uk" autoComplete="email"
            required className="input !h-11 !text-sm" />
        </Field>
        <Field label="Password">
          <input name="password" type="password" placeholder="Your password" autoComplete="current-password"
            required className="input !h-11 !text-sm" />
        </Field>
        <button type="submit" className="btn btn-primary btn-lg w-full">
          <KeyRound className="h-4 w-4" aria-hidden /> Sign in <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </form>

      <details className="disclosure card mt-5 p-4">
        <summary className="text-[13px]">
          <Mail className="h-4 w-4 text-muted" aria-hidden /> Use an email link or reset your password
        </summary>
        <form action={requestLink} className="mt-4 flex flex-col gap-3">
          <Field label="Work email">
            <input name="email" type="email" required autoComplete="email" placeholder="you@company.co.uk" className="input" />
          </Field>
          <button name="kind" value="login" type="submit" className="btn btn-secondary w-full">
            Email me a sign-in link
          </button>
          <button name="kind" value="reset" type="submit" className="btn btn-ghost w-full">
            Reset password
          </button>
        </form>
      </details>

      <p className="mt-8 text-center text-[13px] text-muted">
        New to Kydos CRM? <Link href="/signup" className="link">Create account</Link>
      </p>
    </AuthShell>
  );
}
