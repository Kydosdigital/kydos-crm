import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyUnsubToken } from "@/lib/messaging";
import { notifyOwner } from "@/lib/notify";

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
    <main className="mx-auto max-w-md p-10">
      {!ok ? <h1 className="text-center text-xl font-semibold">This link is not valid</h1> : sent ? (
        <><h1 className="text-xl font-semibold">Thank you</h1><p className="mt-2 text-gray-600">Your feedback has gone straight to the team.</p></>
      ) : (
        <>
          <h1 className="text-xl font-semibold">How did we do?</h1>
          <p className="mb-4 mt-1 text-sm text-gray-600">Tell us privately. We read every message.</p>
          <form action={async (fd) => { "use server"; await submit(fd); const { redirect } = await import("next/navigation"); redirect(`/f/${contact}?t=${t}&sent=1`); }} className="flex flex-col gap-3">
            <input type="hidden" name="c" value={contact} /><input type="hidden" name="t" value={t} />
            <select name="rating" className="rounded border p-2" defaultValue="5">{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} out of 5</option>)}</select>
            <textarea name="text" rows={5} placeholder="What went well, and what could be better?" className="rounded border p-2" />
            <button className="rounded bg-black px-4 py-2 text-white">Send feedback</button>
          </form>
        </>
      )}
    </main>
  );
}
