import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyUnsubToken } from "@/lib/messaging";
import { notifyOwner } from "@/lib/notify";
import { Heart, LinkIcon } from "lucide-react";
import { ClientShell, PublicHeading, ResultCard } from "@/components/shell/public-shell";
import { Field } from "@/components/ui";

// Private feedback page linked from review request emails. It does not filter who is sent to Google:
// the review email always carries the public review link too.
async function submit(fd: FormData) {
  "use server";
  const id = String(fd.get("c")), t = String(fd.get("t"));
  if (!verifyUnsubToken(id, t)) return;
  const db = supabaseAdmin();
  const { data: c } = await db.from("contacts").select("workspace_id,first_name,last_name,tags").eq("id", id).single();
  if (!c) return;
  const rating = String(fd.get("rating") ?? ""), text = String(fd.get("text") ?? "").slice(0, 2000);
  await db.from("notes").insert({ workspace_id: c.workspace_id, contact_id: id, body: `Private feedback, rating ${rating}/5: ${text}` });
  await db.from("contacts").update({ tags: Array.from(new Set([...(c.tags ?? []), "feedback"])) }).eq("id", id);
  await notifyOwner(c.workspace_id, `Feedback from ${[c.first_name, c.last_name].filter(Boolean).join(" ") || "a client"}: ${rating}/5`, text || "(no comment)");
}

export default async function Feedback({ params, searchParams }: { params: Promise<{ contact: string }>; searchParams: Promise<{ t?: string; sent?: string }> }) {
  const { contact } = await params;
  const { t, sent } = await searchParams;
  const ok = !!t && verifyUnsubToken(contact, t);
  return (
    <ClientShell width="sm" center>
      {!ok ? (
        <ResultCard tone="neutral" icon={<LinkIcon aria-hidden />} title="This link is not valid">Please use the link from the most recent email we sent you.</ResultCard>
      ) : sent ? (
        <ResultCard icon={<Heart aria-hidden />} title="Thank you">Your feedback has gone straight to the team.</ResultCard>
      ) : (
        <div className="card p-7 shadow-md sm:p-9">
          <PublicHeading title="How did we do?">Tell us privately. We read every message.</PublicHeading>
          <form action={async (fd) => { "use server"; await submit(fd); const { redirect } = await import("next/navigation"); redirect(`/f/${contact}?t=${t}&sent=1`); }} className="flex flex-col gap-5">
            <input type="hidden" name="c" value={contact} /><input type="hidden" name="t" value={t} />
            <fieldset>
              <legend className="label">Your rating</legend>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n} className="cursor-pointer">
                    <input type="radio" name="rating" value={n} defaultChecked={n === 5} className="peer sr-only" />
                    <span className="flex h-12 items-center justify-center rounded-[10px] border border-line-strong bg-surface text-base font-semibold text-ink-2 shadow-xs transition-colors hover:border-faint peer-checked:border-brand peer-checked:bg-brand peer-checked:text-on-brand peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-text">{n}</span>
                  </label>
                ))}
              </div>
              <div className="hint mt-1.5 flex justify-between"><span>Poor</span><span>Excellent</span></div>
            </fieldset>
            <Field label="Your feedback">
              <textarea name="text" rows={5} placeholder="What went well, and what could be better?" className="textarea !text-sm" />
            </Field>
            <button className="btn btn-primary btn-lg w-full">Send feedback</button>
          </form>
        </div>
      )}
    </ClientShell>
  );
}
