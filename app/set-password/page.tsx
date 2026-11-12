import Link from "next/link";
import { setPassword } from "../actions";
import { AuthShell, PublicHeading } from "@/components/shell/public-shell";
import { Alert, Field } from "@/components/ui";

export default async function SetPassword({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <AuthShell>
      <PublicHeading title="Choose a password">You are signed in. Set a password so you can also sign in without an email link.</PublicHeading>
      {error && <Alert tone="danger">{error}</Alert>}
      <form action={setPassword} className="flex flex-col gap-3">
        <Field label="New password" hint="At least 10 characters.">
          <input name="password" type="password" minLength={10} required placeholder="New password (10+ characters)" autoComplete="new-password" className="input !h-11 !text-sm" />
        </Field>
        <button className="btn btn-primary btn-lg w-full">Save password</button>
      </form>
      <Link href="/contacts" className="btn btn-ghost mt-2 w-full">Skip for now</Link>
    </AuthShell>
  );
}
