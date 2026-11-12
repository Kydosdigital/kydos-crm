"use client";
import { useState } from "react";

type Field = { key: string; label: string; type: string; required?: boolean };
type Form = { headline: string; intro: string | null; button: string; success: string; consent: string; fields: Field[] };
const CORE = ["first_name", "last_name", "email", "phone", "company"];

const ATTR = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "fbclid", "gclid"];
/** Reads campaign tags from this page's address and, inside the embed, from the page it sits on (passed as ?lp=). */
function attribution() {
  const out: Record<string, string> = {};
  try {
    const here = new URLSearchParams(window.location.search);
    const lp = here.get("lp");
    const there = lp ? new URL(lp).searchParams : new URLSearchParams();
    for (const k of ATTR) { const v = here.get(k) || there.get(k); if (v) out[k] = v.slice(0, 200); }
    out.landing_url = (lp || window.location.href).slice(0, 500);
  } catch { /* ignore */ }
  return out;
}

export default function FormClient({ slug, workspace, form, embed }: { slug: string; workspace: string; form: Form; embed: boolean }) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [err, setErr] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("sending");
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = { workspace, consent: fd.get("consent") === "on", custom: {}, page: document.referrer || undefined, attribution: attribution() };
    for (const f of form.fields) {
      const v = String(fd.get(f.key) ?? "").trim();
      if (!v) continue;
      if (CORE.includes(f.key)) body[f.key] = v; else (body.custom as Record<string, string>)[f.key] = v;
    }
    const r = await fetch(`/api/forms/${slug}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) { setState("done"); if (embed) window.parent.postMessage({ type: "kydos-form-done", slug }, "*"); }
    else { setErr((await r.json().catch(() => ({}))).error ?? "Something went wrong"); setState("error"); }
  }
  if (state === "done") return (
    <div className="py-6 text-center" role="status">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success-bg text-success-ink">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
      </div>
      <p className="font-display text-2xl leading-snug text-ink">{form.success}</p>
    </div>
  );
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-[32px] leading-[1.1] tracking-tight text-ink">{form.headline}</h1>
        {form.intro && <p className="mt-2 text-[14px] leading-relaxed text-muted">{form.intro}</p>}
      </div>
      {form.fields.map((f) => (
        <label key={f.key} className="block">
          <span className="label">{f.label}{f.required ? <span className="text-danger" aria-hidden> *</span> : <span className="font-normal text-faint"> (optional)</span>}</span>
          {f.type === "textarea" ? <textarea name={f.key} required={f.required} rows={3} className="textarea !text-sm" />
            : <input name={f.key} type={f.type} required={f.required} className="input !h-11 !text-sm" />}
        </label>
      ))}
      <label className="check-row !text-xs !leading-relaxed text-muted"><input type="checkbox" name="consent" required className="checkbox" />{form.consent}</label>
      {state === "error" && <p role="alert" className="alert alert-danger">{err}</p>}
      <button disabled={state === "sending"} className="btn btn-primary btn-lg w-full">{state === "sending" ? "Sending..." : form.button}</button>
    </form>
  );
}
