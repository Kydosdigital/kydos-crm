import { ShieldCheck, ShieldOff } from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import { disableMfa } from "../../mfa-actions";
import { MfaSetup } from "@/components/shell/mfa-setup";
import { Alert, Badge, Card, CardTitle, Page, PageHeader } from "@/components/ui";

export default async function Account({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const { msg, error } = await searchParams;
  const db = await supabaseServer();
  const { data: u } = await db.auth.getUser();
  const { data: f } = await db.auth.mfa.listFactors();
  const on = (f?.totp ?? []).length > 0;
  return (
    <Page width="narrow">
      <PageHeader title="Your account" description={u.user?.email ?? ""} />
      {msg && <Alert tone="success">{msg}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}
      <Card>
        <CardTitle icon={on ? ShieldCheck : ShieldOff} aside={on ? <Badge tone="success" dot>On</Badge> : <Badge dot>Off</Badge>}>Two-factor sign-in</CardTitle>
        <p className="mb-4 text-[13px] leading-relaxed text-muted">Adds a code from your phone on top of the email link or password. It protects this account if someone gets into your inbox. If you lose your phone, an owner can reset it for you in Supabase.</p>
        {on ? (
          <form action={disableMfa}><button className="btn btn-danger" data-confirm="Turn off two-factor sign-in?">Turn off two-factor sign-in</button></form>
        ) : (
          <MfaSetup />
        )}
      </Card>
    </Page>
  );
}
