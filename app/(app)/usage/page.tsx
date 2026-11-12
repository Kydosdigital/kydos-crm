import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { PoundSterling, Send } from "lucide-react";
import { ChannelIcon, Page, PageHeader, Stat, TableCard } from "@/components/ui";

// Rough list prices in GBP, adjust to your actual Twilio/Resend rates. UK SMS is typically 4 to 5p per segment.
const RATE = { sms: 0.045, whatsapp: 0.04, email: 0.0007 };

export default async function Usage() {
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const since = new Date(); since.setDate(1); since.setHours(0, 0, 0, 0);
  const { data } = await db.from("messages").select("channel,direction,segments,status").eq("workspace_id", ws.id).eq("direction", "out").gte("created_at", since.toISOString());

  const rows = (["sms", "whatsapp", "email"] as const).map((ch) => {
    const m = (data ?? []).filter((x) => x.channel === ch && x.status !== "failed");
    const units = ch === "email" ? m.length : m.reduce((n, x) => n + (x.segments ?? 1), 0);
    return { ch, count: m.length, units, cost: units * RATE[ch] };
  });
  const total = rows.reduce((n, r) => n + r.cost, 0);

  return (
    <Page>
      <PageHeader title="Usage this month" description={<>{ws.name}. Estimates only; check Twilio and Resend billing for exact figures.</>} />
      <div className="mb-6 grid max-w-2xl grid-cols-2 gap-4">
        <Stat label="Estimated cost" value={`£${total.toFixed(2)}`} icon={PoundSterling} tone="brand" />
        <Stat label="Messages sent" value={rows.reduce((n, r) => n + r.count, 0)} icon={Send} />
      </div>
      <TableCard className="max-w-2xl">
        <table className="table">
          <thead><tr><th>Channel</th><th className="num">Messages</th><th className="num">Billable units</th><th className="num">Est. cost</th></tr></thead>
          <tbody>
            {rows.map((r) => <tr key={r.ch}><td><ChannelIcon channel={r.ch} label /></td><td className="num">{r.count}</td><td className="num">{r.units}</td><td className="num font-medium text-ink">£{r.cost.toFixed(2)}</td></tr>)}
            <tr className="font-semibold"><td className="!text-ink" colSpan={3}>Total</td><td className="num !text-ink">£{total.toFixed(2)}</td></tr>
          </tbody>
        </table>
      </TableCard>
    </Page>
  );
}
