"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Search, UserSearch } from "lucide-react";
import { EXTRA_COMMANDS, NAV, type NavItem } from "./nav";

/**
 * Quick jump (Cmd+K or Ctrl+K). Navigation only: it links to existing routes,
 * and "search contacts" opens /contacts?q=... which the Contacts page already handles.
 */
export function CommandMenu() {
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);

  const all = useMemo(() => [...NAV.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label ?? "Go to" }))), ...EXTRA_COMMANDS.map((i) => ({ ...i, group: "Actions" }))], []);
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    const hits: (NavItem & { group: string })[] = t ? all.filter((i) => `${i.label} ${i.keywords ?? ""}`.toLowerCase().includes(t)) : all;
    if (t) hits.push({ href: `/contacts?q=${encodeURIComponent(q.trim())}`, label: `Search contacts for "${q.trim()}"`, icon: UserSearch, group: "Contacts" });
    return hits;
  }, [q, all]);

  const open = () => { setQ(""); setIndex(0); ref.current?.showModal(); inputRef.current?.focus(); };
  const go = (href: string) => { ref.current?.close(); router.push(href); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (ref.current?.open) ref.current.close(); else open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const active = Math.min(index, results.length - 1);

  return (
    <>
      <button type="button" onClick={open} className="flex h-9 w-full items-center gap-2 rounded-lg border border-side-line bg-transparent px-2.5 text-[13px] text-side-muted transition-colors hover:bg-side-hover hover:text-side-ink">
        <Search className="h-3.5 w-3.5" aria-hidden />
        <span className="flex-1 text-left">Search or jump to</span>
        <span className="rounded border border-side-line px-1 text-[10px] font-medium leading-4">Ctrl K</span>
      </button>
      <dialog ref={ref} className="modal !mt-[14vh]" aria-label="Search and jump" onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search className="h-4 w-4 text-faint" aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setIndex(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setIndex(Math.min(active + 1, results.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setIndex(Math.max(active - 1, 0)); }
              else if (e.key === "Enter" && results[active]) { e.preventDefault(); go(results[active].href); }
            }}
            placeholder="Go to a page, or type a name to search contacts"
            aria-label="Search"
            className="h-12 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
          />
          <span className="kbd">Esc</span>
        </div>
        <ul role="listbox" className="max-h-[22rem] overflow-y-auto p-1.5">
          {results.map((r, i) => {
            const Icon = r.icon;
            const showGroup = i === 0 || results[i - 1].group !== r.group;
            return (
              <li key={r.href} role="presentation">
                {showGroup && <div className="eyebrow px-2.5 pb-1 pt-2.5">{r.group}</div>}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => setIndex(i)}
                  onClick={() => go(r.href)}
                  className={`flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] font-medium ${i === active ? "bg-subtle text-ink" : "text-ink-2"}`}
                >
                  <Icon className="h-4 w-4 text-muted" aria-hidden />
                  <span className="flex-1 truncate">{r.label}</span>
                  {i === active && <CornerDownLeft className="h-3.5 w-3.5 text-faint" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      </dialog>
    </>
  );
}
