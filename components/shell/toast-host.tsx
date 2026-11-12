"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";

type T = { id: number; text: string; bad?: boolean };

/**
 * Shows a small confirmation after any server action finishes. Server actions are POSTs carrying a Next-Action header,
 * so we watch fetch rather than touching every form. A button can set data-toast="Message" to word it, or data-toast="off" to stay quiet.
 */
export function ToastHost() {
  const [items, setItems] = useState<T[]>([]);

  useEffect(() => {
    let id = 0;
    let label: string | null = null;
    const push = (text: string, bad?: boolean) => {
      const n = ++id;
      setItems((x) => [...x.slice(-2), { id: n, text, bad }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== n)), bad ? 5000 : 2800);
    };
    const onSubmit = (e: SubmitEvent) => {
      const el = e.submitter as HTMLElement | null;
      label = el?.getAttribute("data-toast") ?? (e.target as HTMLElement | null)?.getAttribute?.("data-toast") ?? null;
    };
    document.addEventListener("submit", onSubmit, true);

    const orig = window.fetch;
    window.fetch = async (...args) => {
      const [input, init] = args;
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      const isAction = init?.method === "POST" && headers.has("Next-Action");
      const quiet = label === "off";
      const text = label && label !== "off" ? label : "Saved";
      if (isAction) label = null;
      try {
        const res = await orig(...args);
        if (isAction && !quiet) {
          if (res.ok) { if (!res.redirected && !res.headers.get("x-action-redirect")) push(text); } else push("Something went wrong. Please try again.", true);
        }
        return res;
      } catch (err) {
        if (isAction && !quiet) push("Could not reach the server. Check your connection.", true);
        throw err;
      }
    };
    return () => { window.fetch = orig; document.removeEventListener("submit", onSubmit, true); };
  }, []);

  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-5 right-5 z-[60] flex flex-col items-end gap-2">
      {items.map((t) => (
        <div key={t.id} role="status" className="animate-rise pointer-events-auto flex items-center gap-2 rounded-[10px] bg-ink px-3.5 py-2.5 text-[13px] font-medium text-canvas shadow-lg">
          {t.bad ? <AlertCircle className="h-4 w-4 text-danger" aria-hidden /> : <CheckCircle2 className="h-4 w-4 text-brand-text" aria-hidden />}
          {t.text}
        </div>
      ))}
    </div>
  );
}
