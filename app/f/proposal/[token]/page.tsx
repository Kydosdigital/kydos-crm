/* eslint-disable @next/next/no-img-element */
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { bodyToHtml } from "@/lib/emailBrand";
import { notifyOwner } from "@/lib/notify";
import { CheckCircle2, PenLine } from "lucide-react";

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
    <div data-theme="light" className="min-h-screen bg-canvas py-10 text-ink sm:py-14">
      <div className="animate-rise mx-auto max-w-[720px] px-4">
        <article className="card overflow-hidden shadow-md">
          <header className="flex items-center justify-between gap-4 px-8 py-5 text-white sm:px-12" style={{ background: brand }}>
            {ws?.logo_url ? <img src={ws.logo_url} alt={ws.name} className="h-10" /> : <b className="text-xl font-semibold tracking-tight">{ws?.name}</b>}
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-80">Proposal</span>
          </header>
          <div className="px-8 pb-10 pt-9 sm:px-12">
            <h1 className="font-display text-[40px] leading-[1.08] tracking-tight text-ink">{p.title}</h1>
            {p.amount_gbp != null && (
              <div className="mt-6 flex items-baseline justify-between gap-4 rounded-xl border border-line bg-sunken px-5 py-4">
                <span className="eyebrow">Investment</span>
                <p className="tabular text-2xl font-semibold tracking-tight" style={{ color: brand }}>£{Number(p.amount_gbp).toLocaleString("en-GB", { minimumFractionDigits: 2 })}</p>
              </div>
            )}
            <div className="rich mt-8 text-[15px] leading-relaxed text-ink-2" dangerouslySetInnerHTML={{ __html: bodyToHtml(p.body, brand) }} />
            <hr className="my-9" />
            {p.status === "accepted" && <p className="alert alert-success !text-sm"><CheckCircle2 aria-hidden /><span>Accepted by {p.signed_name} on {new Date(p.responded_at!).toLocaleDateString("en-GB", { timeZone: "Europe/London", dateStyle: "long" })}. Thank you, we will be in touch shortly.</span></p>}
            {p.status === "declined" && <p className="alert !text-sm">You declined this proposal. If that was a mistake, just reply to our email.</p>}
            {!done && (
              <form method="post" action={`/api/proposals/${token}`} className="flex flex-col gap-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-subtle text-ink-2"><PenLine className="h-4 w-4" aria-hidden /></span>
                  <div><p className="text-base font-semibold text-ink">Happy to go ahead?</p><p className="text-[13px] text-muted">Type your full name to accept.</p></div>
                </div>
                <input name="name" placeholder="Your full name" aria-label="Your full name" autoComplete="name" required className="input !h-12 !font-display !text-xl" />
                <label className="check-row"><input type="checkbox" name="agree" required className="checkbox" /><span>I accept this proposal and agree to the terms above on behalf of {"my business"}.</span></label>
                <div className="flex gap-2">
                  <button name="action" value="accept" className="btn btn-lg font-semibold text-white shadow-sm hover:brightness-95" style={{ background: brand }}>Accept proposal</button>
                </div>
                <details className="disclosure text-[13px] text-muted"><summary className="!font-medium !text-muted">Not for us? Tell us why</summary>
                  <textarea name="reason" rows={2} placeholder="Optional reason" aria-label="Optional reason" className="textarea mt-3" />
                  <button name="action" value="decline" formNoValidate className="btn btn-secondary btn-sm mt-2">Decline</button>
                </details>
              </form>
            )}
          </div>
        </article>
        <p className="mt-5 text-center text-xs text-muted">{ws?.name}{ws?.business_address ? `, ${ws.business_address}` : ""}</p>
      </div>
    </div>
  );
}
