import { supabaseAdmin } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import FormClient from "./client";

export const dynamic = "force-dynamic";

// Public hosted form. /f/form/<slug>?ws=<workspace slug>. Add &embed=1 inside an iframe (used by the exit-intent popup).
export default async function HostedForm({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ws?: string; embed?: string }> }) {
  const { slug } = await params;
  const { ws: wsSlug, embed } = await searchParams;
  const db = supabaseAdmin();
  const { data: ws } = await db.from("workspaces").select("id,slug,name").eq("slug", wsSlug ?? process.env.INBOUND_WORKSPACE_SLUG ?? "kydos-digital").maybeSingle();
  if (!ws) notFound();
  const { data: f } = await db.from("hosted_forms").select("*").eq("workspace_id", ws.id).eq("slug", slug).eq("active", true).maybeSingle();
  if (!f) notFound();
  await db.from("hosted_forms").update({ views: (f.views ?? 0) + 1 }).eq("id", f.id);
  return (
    <div className={embed ? "p-6" : "mx-auto my-10 max-w-md rounded-lg border bg-white p-6 shadow-sm"}>
      <FormClient slug={slug} workspace={ws.slug} form={{ headline: f.headline, intro: f.intro, button: f.button_text, success: f.success_message, consent: f.consent_text, fields: f.fields }} embed={!!embed} />
    </div>
  );
}
