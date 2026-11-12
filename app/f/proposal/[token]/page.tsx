/* eslint-disable @next/next/no-img-element */
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { bodyToHtml } from "@/lib/emailBrand";
import { notifyOwner } from "@/lib/notify";

export const dynamic = "force-dynamic";

// Private client view of a proposal. The long random token is the only credential.
export default async function Proposal({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = supabaseAdmin();
  const { data: p } = await db.from("proposals").select("*").eq("token", token).neq("status", "draft").maybeSingle();
  if (!p) notFound();
  const { data: ws } = await db.from("workspaces").select("name,brand_color,logo_url,business_address").eq("id", p.workspace_id).single();
  if (p.status === "sent") {
    await db.from("proposals").update({ status: "viewed", viewed_at: new Date().toISOString() }).eq("id", p.id).eq("status", "sent");
    await notifyOwner(p.workspace_id, "Proposal opened", `${p.title} has just been viewed.`);
  }
  const brand = /^#[0-9a-fA-F]{6}$/.test(ws?.brand_color ?? "") ? ws!.brand_color! : "#1f3a5f";
  const done = p.status === "accepted" || p.status === "declined";
  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="mx-auto max-w-2xl px-3">
        <div className="rounded-t-lg px-6 py-4 text-white" style={{ background: brand }}>
          {ws?.logo_url ? <img src={ws.logo_url} alt={ws.name} className="h-10" /> : <b className="text-xl">{ws?.name}</b>}
        </div>
        <div className="rounded-b-lg bg-white p-6 shadow-sm">
          <h1 className="mb-1 text-2xl font-semibold">{p.title}</h1>
          {p.amount_gbp != null && <p className="mb-4 text-lg" style={{ color: brand }}>£{Number(p.amount_gbp).toLocaleString("en-GB", { minimumFractionDigits: 2 })}</p>}
          <div className="leading-relaxed" dangerouslySetInnerHTML={{ __html: bodyToHtml(p.body, brand) }} />
          <hr className="my-6" />
          {p.status === "accepted" && <p className="rounded bg-green-50 p-3 text-green-800">Accepted by {p.signed_name} on {new Date(p.responded_at!).toLocaleDateString("en-GB", { timeZone: "Europe/London", dateStyle: "long" })}. Thank you, we will be in touch shortly.</p>}
          {p.status === "declined" && <p className="rounded bg-gray-50 p-3 text-gray-700">You declined this proposal. If that was a mistake, just reply to our email.</p>}
          {!done && (
            <form method="post" action={`/api/proposals/${token}`} className="flex flex-col gap-3 text-sm">
              <p className="font-medium">Happy to go ahead? Type your full name to accept.</p>
              <input name="name" placeholder="Your full name" required className="rounded border p-2" />
              <label><input type="checkbox" name="agree" required className="mr-2" />I accept this proposal and agree to the terms above on behalf of {"my business"}.</label>
              <div className="flex gap-2">
                <button name="action" value="accept" className="rounded px-5 py-2 font-semibold text-white" style={{ background: brand }}>Accept proposal</button>
              </div>
              <details className="text-xs text-gray-600"><summary className="cursor-pointer">Not for us? Tell us why</summary>
                <textarea name="reason" rows={2} placeholder="Optional reason" className="mt-2 w-full rounded border p-2" />
                <button name="action" value="decline" formNoValidate className="mt-2 rounded border px-3 py-1.5">Decline</button>
              </details>
            </form>
          )}
        </div>
        <p className="mt-3 text-center text-xs text-gray-500">{ws?.name}{ws?.business_address ? `, ${ws.business_address}` : ""}</p>
      </div>
    </div>
  );
}
