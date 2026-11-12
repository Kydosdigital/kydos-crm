"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

type Row = { key: string; label: string; type: string; required: boolean };
const TYPES = ["text", "email", "tel", "textarea", "number", "date"];
const PRESETS: Row[] = [
  { key: "first_name", label: "First name", type: "text", required: true },
  { key: "last_name", label: "Last name", type: "text", required: false },
  { key: "email", label: "Email", type: "email", required: true },
  { key: "phone", label: "Phone", type: "tel", required: false },
  { key: "company", label: "Company", type: "text", required: false },
  { key: "message", label: "How can we help?", type: "textarea", required: false },
];
const clean = (s: string) => s.replace(/[|\n\r]/g, " ");
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "field";

function parse(v: string): Row[] {
  return v.split("\n").map((l) => l.split("|").map((x) => x.trim())).filter((p) => p[0]).map((p) => ({ key: p[0], label: p[1] || p[0], type: TYPES.includes(p[2]) ? p[2] : "text", required: /^req/i.test(p[3] ?? "") }));
}

/** Visual editor for a form's fields. Submits the same "key | label | type | required" text the server already parses. */
export function FieldBuilder({ defaultValue }: { defaultValue: string }) {
  const [rows, setRows] = useState<Row[]>(() => parse(defaultValue));
  const upd = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: number) => setRows((r) => { const n = [...r]; const j = i + d; if (j < 0 || j >= n.length) return r; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const add = (row: Row) => setRows((r) => {
    let key = row.key; let n = 2;
    while (r.some((x) => x.key === key)) key = `${row.key}_${n++}`;
    return [...r, { ...row, key }];
  });
  const value = rows.map((r) => `${slug(r.key)} | ${clean(r.label) || r.key} | ${r.type} | ${r.required ? "required" : "optional"}`).join("\n");
  const unused = PRESETS.filter((p) => !rows.some((r) => r.key === p.key));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_260px] gap-4">
      <textarea name="fields" value={value} readOnly hidden aria-hidden />
      <div className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <div key={i} className="well flex flex-wrap items-center gap-2 p-2.5">
            <input aria-label="Label" value={r.label} onChange={(e) => upd(i, { label: e.target.value, key: ["first_name", "last_name", "email", "phone", "company", "message"].includes(r.key) ? r.key : slug(e.target.value) })} className="input input-sm min-w-[8rem] flex-1" placeholder="Label" />
            <select aria-label="Type" value={r.type} onChange={(e) => upd(i, { type: e.target.value })} className="select input-sm !w-auto">{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
            <label className="check-row !text-xs"><input type="checkbox" checked={r.required} onChange={(e) => upd(i, { required: e.target.checked })} className="checkbox" />Required</label>
            <span className="flex items-center">
              <button type="button" className="btn btn-ghost btn-sm" aria-label="Move up" onClick={() => move(i, -1)}><ArrowUp aria-hidden /></button>
              <button type="button" className="btn btn-ghost btn-sm" aria-label="Move down" onClick={() => move(i, 1)}><ArrowDown aria-hidden /></button>
              <button type="button" className="btn btn-ghost btn-sm" aria-label="Remove field" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}><Trash2 aria-hidden /></button>
            </span>
            <span className="w-full font-mono text-[11px] text-muted">key: {r.key}</span>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => add({ key: "custom", label: "New field", type: "text", required: false })}><Plus aria-hidden />Custom field</button>
          {unused.map((p) => <button key={p.key} type="button" className="badge hover:text-ink" onClick={() => add(p)}>+ {p.label}</button>)}
        </div>
      </div>
      <div className="rounded-[12px] border border-line bg-surface p-3.5">
        <p className="eyebrow mb-2">Preview</p>
        <div className="flex flex-col gap-2.5">
          {rows.map((r, i) => (
            <div key={i}>
              <span className="mb-1 block text-[11px] font-medium text-ink-2">{r.label}{r.required ? " *" : ""}</span>
              {r.type === "textarea" ? <div className="h-12 rounded-md border border-line bg-sunken" /> : <div className="h-7 rounded-md border border-line bg-sunken" />}
            </div>
          ))}
          {rows.length === 0 && <p className="text-xs text-muted">Add a field to see it here.</p>}
        </div>
      </div>
    </div>
  );
}
