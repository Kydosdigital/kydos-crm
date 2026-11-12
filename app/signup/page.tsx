import Link from "next/link";
import { MailCheck } from "lucide-react";
import { requestAccess } from "../actions";
import { AuthShell, PublicHeading } from "@/components/shell/public-shell";
import { Field } from "@/components/ui";

export default async function Signup({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const { sent } = await searchParams;
  return (
    <AuthShell>
      {sent ? (
        <div>
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-success-bg text-success-ink"><MailCheck className="h-6 w-6" aria-hidden /></div>
          <PublicHeading title="Request received">Thanks. We have let the team know. Once you are approved you will get an invite email with a link to sign in.</PublicHeading>
        </div>
      ) : (
        <>
          <PublicHeading title="Request access">Tell us who you are and the team will send you an invite.</PublicHeading>
          <form action={requestAccess} className="flex flex-col gap-3">
            <Field label="Your name"><input name="name" placeholder="First and last name" autoComplete="name" required className="input !h-11 !text-sm" /></Field>
            <Field label="Email"><input name="email" type="email" placeholder="you@company.co.uk" autoComplete="email" required className="input !h-11 !text-sm" /></Field>
            <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
            <button className="btn btn-primary btn-lg mt-1 w-full">Request access</button>
          </form>
        </>
      )}
      <p className="mt-8 text-center text-[13px] text-muted">Already invited? <Link href="/login" className="link">Sign in with an email link</Link></p>
    </AuthShell>
  );
}
