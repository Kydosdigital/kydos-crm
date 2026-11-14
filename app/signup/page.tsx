import Link from "next/link";
import { ArrowRight, CheckCircle2, MailCheck } from "lucide-react";
import { createAccount } from "./actions";
import { AuthShell, PublicHeading } from "@/components/shell/public-shell";
import { Alert, Field } from "@/components/ui";

const ERRORS: Record<string, string> = {
  details: "Enter your name and a valid email address.",
  password: "Use a password of at least 10 characters, up to 128.",
  mismatch: "The passwords do not match. Please try again.",
  limited: "Too many attempts. Please try again later.",
  unavailable: "We couldn't create your account just now. Please try again later.",
};

export default async function Signup({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  const { error, status } = await searchParams;

  return (
    <AuthShell>
      {status === "check" ? (
        <div>
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-success-bg text-success-ink">
            <MailCheck className="h-6 w-6" aria-hidden />
          </div>
          <PublicHeading title="Check your inbox">
            If the email can be registered, we&apos;ve sent a verification link.
            Open it to confirm your address, then sign in with your password.
          </PublicHeading>
          <div className="card mb-5 p-4 text-sm text-muted">
            <p>Didn&apos;t receive the email? Check your spam or junk folder and confirm that you entered the correct address.</p>
            <p className="mt-2">If you already have an account, you can sign in instead.</p>
          </div>
          <Link href="/login" className="btn btn-primary btn-lg w-full">
            Go to sign in <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      ) : (
        <>
          <PublicHeading title="Create your account">
            One simple registration. Add your details, choose a password and
            confirm your email to get started.
          </PublicHeading>
          {error && ERRORS[error] && <Alert tone="danger">{ERRORS[error]}</Alert>}
          <form action={createAccount} className="flex flex-col gap-3">
            <Field label="Full name">
              <input name="name" type="text" required minLength={2} maxLength={80}
                autoComplete="name" placeholder="Your full name" className="input !h-11 !text-sm" />
            </Field>
            <Field label="Work email">
              <input name="email" type="email" required maxLength={254}
                autoComplete="email" placeholder="you@company.co.uk" className="input !h-11 !text-sm" />
            </Field>
            <Field label="Password" hint="At least 10 characters. Use a unique password.">
              <input name="password" type="password" required minLength={10} maxLength={128}
                autoComplete="new-password" placeholder="Create a password" className="input !h-11 !text-sm" />
            </Field>
            <Field label="Confirm password">
              <input name="confirm_password" type="password" required minLength={10} maxLength={128}
                autoComplete="new-password" placeholder="Repeat your password" className="input !h-11 !text-sm" />
            </Field>
            <div className="hidden" aria-hidden="true">
              <label htmlFor="registration-website">Leave this blank</label>
              <input id="registration-website" name="website" tabIndex={-1} autoComplete="off" />
            </div>
            <button type="submit" className="btn btn-primary btn-lg mt-2 w-full">
              <CheckCircle2 className="h-4 w-4" aria-hidden /> Create account
            </button>
          </form>
          <p className="mt-4 text-xs leading-relaxed text-muted">
            Your account is personal to you. A workspace administrator assigns team roles and business access separately.
          </p>
          <p className="mt-7 text-center text-[13px] text-muted">
            Already have an account? <Link href="/login" className="link">Sign in</Link>
          </p>
        </>
      )}
    </AuthShell>
  );
}
