"use client";

import { ChevronsUpDown } from "lucide-react";

/**
 * The business switcher's <select name="ws">. It lives inside the server-rendered
 * <form action={switchWorkspace}> and simply submits that form when the choice changes.
 */
export function WorkspaceSelect({ options, value }: { options: { id: string; name: string }[]; value?: string }) {
  const current = options.find((o) => o.id === value)?.name ?? "Choose business";
  return (
    <div className="relative">
      <div aria-hidden className="pointer-events-none flex h-10 items-center gap-2.5 rounded-lg border border-side-line bg-side-hover px-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/10 text-[11px] font-semibold text-side-ink">{current.slice(0, 1).toUpperCase()}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-side-ink">{current}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-side-muted" />
      </div>
      <select
        name="ws"
        aria-label="Switch business"
        defaultValue={value}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="absolute inset-0 h-full w-full cursor-pointer rounded-lg opacity-0"
      >
        {options.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>
    </div>
  );
}
