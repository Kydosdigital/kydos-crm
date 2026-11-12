"use client";
import { useState } from "react";

type Field = { key: string; label: string; type: string; required?: boolean };
type Form = { headline: string; intro: string | null; button: string; success: string; consent: string; fields: Field[] };
const CORE = ["first_name", "last_name", "email", "phone", "company"];

export default function FormClient({ slug, workspace, form, embed }: { slug: string; workspace: string; form: Form; embed: boolean }) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [err, setErr] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("sending");
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = { workspace, consent: fd.get("consent") === "on", custom: {}, page: document.referrer || undefined };
    for (const f of form.fields) {
      const v = String(fd.get(f.key) ?? "").trim();
      if (!v) continue;
      if (CORE.includes(f.key)) body[f.key] = v; else (body.custom as Record<string, string>)[f.key] = v;
    }
    const r = await fetch(`/api/forms/${slug}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) { setState("done"); if (embed) window.parent.postMessage({ type: "kydos-form-done", slug }, "*"); }
    else { setErr((await r.json().catch(() => ({}))).error ?? "Something went wrong"); setState("error"); }
  }
  if (state === "done") return <p className="text-center text-lg">{form.success}</p>;
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 text-sm">
      <h1 className="text-xl font-semibold">{form.headline}</h1>
      {form.intro && <p className="text-gray-600">{form.intro}</p>}
      {form.fields.map((f) => (
        <label key={f.key} className="flex flex-col gap-1">{f.label}{f.required ? " *" : ""}
          {f.type === "textarea" ? <textarea name={f.key} required={f.required} rows={3} className="rounded border p-2" />
            : <input name={f.key} type={f.type} required={f.required} className="rounded border p-2" />}
        </label>
      ))}
      <label className="flex items-start gap-2 text-xs text-gray-600"><input type="checkbox" name="consent" required className="mt-0.5" />{form.consent}</label>
      {state === "error" && <p className="text-red-600">{err}</p>}
      <button disabled={state === "sending"} className="rounded bg-[#1f3a5f] px-3 py-2 font-medium text-white disabled:opacity-60">{state === "sending" ? "Sending..." : form.button}</button>
    </form>
  );
}
