import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyUnsubToken } from "@/lib/messaging";
import { LinkIcon, MailX } from "lucide-react";
import { ClientShell, ResultCard } from "@/components/shell/public-shell";

export default async function Unsubscribe({
  params,
  searchParams,
}: {
  params: Promise<{ contact: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { contact } = await params;
  const { t } = await searchParams;
  const ok = !!t && verifyUnsubToken(contact, t);
  if (ok) await supabaseAdmin().from("contacts").update({ email_opt_out: true }).eq("id", contact);
  return (
    <ClientShell width="sm" center>
      {ok ? (
        <ResultCard icon={<MailX aria-hidden />} title="You have been unsubscribed">You will no longer receive marketing emails from us.</ResultCard>
      ) : (
        <ResultCard tone="neutral" icon={<LinkIcon aria-hidden />} title="This link is not valid">Please use the unsubscribe link from the most recent email we sent you.</ResultCard>
      )}
    </ClientShell>
  );
}
