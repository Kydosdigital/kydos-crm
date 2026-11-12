"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Copies `text` to the clipboard. Visual convenience only. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1600); } catch { /* clipboard unavailable */ }
      }}
    >
      {done ? <Check /> : <Copy />}{done ? "Copied" : label}
    </button>
  );
}

/** Monospace block with a copy button in the corner. */
export function CodeBlock({ code, className }: { code: string; className?: string }) {
  return (
    <div className={`relative ${className ?? ""}`}>
      <pre className="codeblock pr-24">{code}</pre>
      <div className="absolute right-1.5 top-1.5"><CopyButton text={code} /></div>
    </div>
  );
}
