import { CheckCircle2, CircleSlash } from "lucide-react";
import { ClientShell, ResultCard } from "@/components/shell/public-shell";

export default async function Paid({ searchParams }: { searchParams: Promise<{ cancelled?: string }> }) {
  const { cancelled } = await searchParams;
  return (
    <ClientShell width="sm" center>
      {cancelled ? (
        <ResultCard tone="neutral" icon={<CircleSlash aria-hidden />} title="Payment cancelled">You can use the link in your email to try again.</ResultCard>
      ) : (
        <ResultCard icon={<CheckCircle2 aria-hidden />} title="Thank you">Your payment has been received.</ResultCard>
      )}
    </ClientShell>
  );
}
