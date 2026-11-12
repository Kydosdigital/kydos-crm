"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Selection controls for the contacts table. Row checkboxes carry name="ids" and form="bulk", so the bulk form
 * posts whatever is ticked. This component only adds select-all and shows the action bar once something is ticked.
 */
export function BulkBar({ automations, canDelete, actions }: {
  automations: { id: string; name: string }[]; canDelete: boolean;
  actions: { tag: (fd: FormData) => Promise<void>; enrol: (fd: FormData) => Promise<void>; del: (fd: FormData) => Promise<void> };
}) {
  const [n, setN] = useState(0);
  const root = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const boxes = () => Array.from(document.querySelectorAll<HTMLInputElement>("input[name=ids][form=bulk]"));
    const sync = () => {
      const b = boxes();
      setN(b.filter((x) => x.checked).length);
      const all = document.getElementById("select-all") as HTMLInputElement | null;
      if (all) { all.checked = b.length > 0 && b.every((x) => x.checked); all.indeterminate = b.some((x) => x.checked) && !all.checked; }
    };
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.id === "select-all") boxes().forEach((x) => (x.checked = t.checked));
      if (t.id === "select-all" || (t.name === "ids" && t.getAttribute("form") === "bulk")) sync();
    };
    document.addEventListener("change", onChange);
    return () => document.removeEventListener("change", onChange);
  }, []);
  return (
    <form id="bulk" ref={root} className={`card sticky bottom-4 z-10 mt-4 flex flex-wrap items-center gap-2 p-3 shadow-lg ${n ? "" : "hidden"}`}>
      <span className="mr-2 text-[13px] font-semibold text-ink tabular">{n} selected</span>
      <input name="tag" placeholder="Tag to add" aria-label="Tag to add" className="input input-sm !w-36" />
      <button formAction={actions.tag} className="btn btn-secondary btn-sm">Add tag</button>
      <span className="mx-1 h-5 w-px bg-line" aria-hidden />
      <select name="automation_id" aria-label="Automation" className="select input-sm !w-48" defaultValue="">
        <option value="" disabled>Choose automation</option>
        {automations.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <button formAction={actions.enrol} className="btn btn-secondary btn-sm">Enrol</button>
      {canDelete && <button formAction={actions.del} data-confirm="Delete the selected contacts and all their messages? This cannot be undone." className="btn btn-danger btn-sm ml-auto">Delete selected</button>}
    </form>
  );
}
