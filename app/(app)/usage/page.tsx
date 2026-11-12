import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";

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
    <div className="max-w-xl">
      <h1 className="mb-1 text-2xl font-semibold">Usage this month</h1>
      <p className="mb-4 text-sm text-gray-500">{ws.name}. Estimates only; check Twilio and Resend billing for exact figures.</p>
      <table className="w-full text-left text-sm">
        <thead className="border-b text-gray-500"><tr><th className="py-2">Channel</th><th>Messages</th><th>Billable units</th><th>Est. cost</th></tr></thead>
        <tbody>
          {rows.map((r) => <tr key={r.ch} className="border-b"><td className="py-2">{r.ch}</td><td>{r.count}</td><td>{r.units}</td><td>£{r.cost.toFixed(2)}</td></tr>)}
          <tr className="font-semibold"><td className="py-2" colSpan={3}>Total</td><td>£{total.toFixed(2)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}
