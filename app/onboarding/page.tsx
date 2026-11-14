import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, RefreshCw } from "lucide-react";
import { AuthShell, PublicHeading } from "@/components/shell/public-shell";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Onboarding() {
  const db = await supabaseServer();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) redirect("/login");
  const { data, error } = await db.from("workspace_members")
    .select("workspace_id").eq("user_id", user.id).limit(1);
  if (!error && data?.length) redirect("/contacts");

  return (
    <AuthShell>
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-success-bg text-success-ink">
        <CheckCircle2 className="h-6 w-6" aria-hidden />
      </div>
      <PublicHeading title="Your account is ready">
        You can now sign in with your email and password.
      </PublicHeading>
      <div className="card p-5 text-sm text-muted">
        {error ? (
          <p>We couldn&apos;t check your business access just now. Please try again.</p>
        ) : (
          <>
            <p className="font-semibold text-ink">Getting access to your team&apos;s CRM</p>
            <p className="mt-2">
              Your team administrator needs to add the email address you registered with
              under <strong>Team → Invite</strong>. You will then be able to open that business.
            </p>
            <p className="mt-2">An account never grants itself access to another business or an administrator role.</p>
          </>
        )}
      </div>
      <Link href="/onboarding?refresh=1" className="btn btn-primary btn-lg mt-5 w-full">
        <RefreshCw className="h-4 w-4" aria-hidden /> Check team access
      </Link>
      <Link href="/login" className="btn btn-ghost mt-3 w-full">Return to sign in</Link>
    </AuthShell>
  );
}
