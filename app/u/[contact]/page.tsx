import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyUnsubToken } from "@/lib/messaging";

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
    <main className="mx-auto max-w-md p-10 text-center">
      <h1 className="text-xl font-semibold">{ok ? "You have been unsubscribed" : "This link is not valid"}</h1>
      {ok && <p className="mt-2 text-gray-600">You will no longer receive marketing emails from us.</p>}
    </main>
  );
}
