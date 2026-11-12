"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

type F = { label: string; placeholder?: string; area?: boolean; narrow?: boolean };
type Spec = { label: string; group: string; fields: F[]; sep?: "pipe" | "equals" };

const SPEC: Record<string, Spec> = {
  send_email: { label: "Send email", group: "Messages", fields: [{ label: "Subject" }, { label: "Body", area: true, placeholder: "Hi {{first_name}}," }] },
  send_sms: { label: "Send SMS", group: "Messages", fields: [{ label: "Message", area: true, placeholder: "Hi {{first_name}}, ..." }] },
  send_whatsapp: { label: "Send WhatsApp template", group: "Messages", fields: [{ label: "Template name" }, { label: "Variables, separated by |", placeholder: "{{first_name}}" }] },
  notify: { label: "Notify me by email", group: "Messages", fields: [{ label: "Subject" }, { label: "Body", area: true }] },
  webhook: { label: "Call a webhook", group: "Messages", fields: [{ label: "URL", placeholder: "https://" }] },
  wait: { label: "Wait", group: "Timing", fields: [{ label: "Hours", narrow: true, placeholder: "48" }] },
  wait_weekday: { label: "Wait until next weekday", group: "Timing", fields: [{ label: "At hour (0-23)", narrow: true, placeholder: "9" }] },
  wait_until: { label: "Wait until a goal", group: "Timing", fields: [{ label: "Condition", placeholder: "replied" }, { label: "Time out after (hours)", narrow: true, placeholder: "48" }] },
  wait_before: { label: "Wait until before a booking", group: "Timing", fields: [{ label: "Hours before", narrow: true }, { label: "Skip steps if too late", narrow: true, placeholder: "0" }] },
  wait_after: { label: "Wait until after a booking", group: "Timing", fields: [{ label: "Hours after", narrow: true }] },
  skip_if: { label: "Skip next steps if", group: "Branching", fields: [{ label: "Condition", placeholder: "replied" }, { label: "How many steps", narrow: true, placeholder: "1" }] },
  skip_unless: { label: "Skip next steps unless", group: "Branching", fields: [{ label: "Condition", placeholder: "tag:vip" }, { label: "How many steps", narrow: true, placeholder: "1" }] },
  split: { label: "Split test", group: "Branching", fields: [{ label: "% who skip", narrow: true, placeholder: "50" }, { label: "Steps skipped", narrow: true, placeholder: "1" }] },
  stop_if_replied: { label: "Stop if the contact replied", group: "Branching", fields: [] },
  end: { label: "End the automation", group: "Branching", fields: [] },
  add_tag: { label: "Add tag", group: "CRM actions", fields: [{ label: "Tag" }] },
  remove_tag: { label: "Remove tag", group: "CRM actions", fields: [{ label: "Tag" }] },
  create_task: { label: "Create task", group: "CRM actions", fields: [{ label: "Task title", placeholder: "Call {{first_name}}" }] },
  move_stage: { label: "Move pipeline stage", group: "CRM actions", fields: [{ label: "Stage name" }] },
  create_opportunity: { label: "Create opportunity", group: "CRM actions", fields: [{ label: "Title" }, { label: "Value (£)", narrow: true }, { label: "Stage (optional)" }] },
  assign_owner: { label: "Assign owner", group: "CRM actions", fields: [{ label: "Teammate email or round_robin" }] },
  set_field: { label: "Set custom field", group: "CRM actions", sep: "equals", fields: [{ label: "Field key" }, { label: "Value" }] },
  enrol: { label: "Start another automation", group: "CRM actions", fields: [{ label: "Automation name" }] },
};
const GROUPS = ["Messages", "Timing", "Branching", "CRM actions"];

type Step = { type: string; args: string[] };

function parse(text: string): Step[] {
  return text.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    const i = line.indexOf(":");
    const type = (i === -1 ? line : line.slice(0, i)).trim();
    const arg = i === -1 ? "" : line.slice(i + 1).trim();
    const spec = SPEC[type];
    if (!spec) return { type, args: [arg] };
    const n = spec.fields.length;
    if (n === 0) return { type, args: [] };
    if (spec.sep === "equals") { const [k, ...v] = arg.split("="); return { type, args: [k.trim(), v.join("=").trim()] }; }
    if (n === 1) return { type, args: [arg] };
    const parts = arg.split("|").map((x) => x.trim());
    const head = parts.slice(0, n - 1);
    const tail = parts.slice(n - 1).join(" | ");
    return { type, args: [...head, tail] };
  });
}
function ser(steps: Step[]): string {
  return steps.map((s) => {
    const spec = SPEC[s.type];
    if (!spec) return s.args[0] ? `${s.type}: ${s.args[0]}` : s.type;
    if (spec.fields.length === 0) return s.type;
    if (spec.sep === "equals") return `${s.type}: ${s.args[0] ?? ""} = ${s.args[1] ?? ""}`;
    return `${s.type}: ${s.args.map((a) => (a ?? "").replace(/\r/g, "").replace(/\n/g, "\\n")).join(" | ")}`;
  }).join("\n");
}
const show = (v: string) => (v ?? "").replace(/\\n/g, "\n");
const hide = (v: string) => v.replace(/\n/g, "\\n");

/** Visual step editor. Writes the same one-line-per-step text the server parses, and keeps a text mode for power use. */
export function StepBuilder({ defaultValue }: { defaultValue: string }) {
  const [steps, setSteps] = useState<Step[]>(() => parse(defaultValue));
  const [text, setText] = useState(defaultValue);
  const [mode, setMode] = useState<"visual" | "text">("visual");
  const [picker, setPicker] = useState("");
  const value = mode === "text" ? text : ser(steps);

  const setArg = (i: number, k: number, v: string) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, args: Object.assign([...x.args], { [k]: v }) } : x)));
  const move = (i: number, d: number) => setSteps((s) => { const n = [...s]; const j = i + d; if (j < 0 || j >= n.length) return s; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const add = (type: string) => { if (type) { setSteps((s) => [...s, { type, args: (SPEC[type]?.fields ?? []).map(() => "") }]); setPicker(""); } };

  return (
    <div className="flex flex-col gap-3">
      <textarea name="steps" value={value} readOnly hidden aria-hidden />
      <div className="flex items-center gap-1.5">
        <button type="button" className={`badge ${mode === "visual" ? "badge-brand" : "hover:text-ink"}`} onClick={() => { if (mode === "text") setSteps(parse(text)); setMode("visual"); }}>Visual</button>
        <button type="button" className={`badge ${mode === "text" ? "badge-brand" : "hover:text-ink"}`} onClick={() => { if (mode === "visual") setText(ser(steps)); setMode("text"); }}>Text</button>
      </div>

      {mode === "text" ? (
        <textarea rows={14} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} aria-label="Steps as text" className="textarea !font-mono !text-xs" />
      ) : (
        <>
          <ol className="flex flex-col gap-2">
            {steps.map((s, i) => {
              const spec = SPEC[s.type];
              return (
                <li key={i} className="well relative p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-[13px] font-semibold text-ink"><span className="tabular flex h-5 w-5 items-center justify-center rounded-full bg-subtle text-[11px] text-muted">{i + 1}</span>{spec?.label ?? s.type}</span>
                    <span className="flex items-center">
                      <button type="button" className="btn btn-ghost btn-sm" aria-label="Move up" onClick={() => move(i, -1)}><ArrowUp aria-hidden /></button>
                      <button type="button" className="btn btn-ghost btn-sm" aria-label="Move down" onClick={() => move(i, 1)}><ArrowDown aria-hidden /></button>
                      <button type="button" className="btn btn-ghost btn-sm" aria-label="Remove step" onClick={() => setSteps((x) => x.filter((_, j) => j !== i))}><Trash2 aria-hidden /></button>
                    </span>
                  </div>
                  {spec ? (
                    <div className="flex flex-wrap gap-2">
                      {spec.fields.map((f, k) => (
                        <label key={k} className={f.narrow ? "w-36" : f.area || spec.fields.length === 1 ? "w-full" : "min-w-[10rem] flex-1"}>
                          <span className="mb-1 block text-[11px] font-medium text-muted">{f.label}</span>
                          {f.area
                            ? <textarea rows={3} value={show(s.args[k] ?? "")} onChange={(e) => setArg(i, k, hide(e.target.value))} placeholder={f.placeholder} className="textarea !text-[13px]" />
                            : <input value={s.args[k] ?? ""} onChange={(e) => setArg(i, k, e.target.value)} placeholder={f.placeholder} className="input input-sm" />}
                        </label>
                      ))}
                      {spec.fields.length === 0 && <span className="text-xs text-muted">No settings.</span>}
                    </div>
                  ) : (
                    <input value={s.args[0] ?? ""} onChange={(e) => setArg(i, 0, e.target.value)} aria-label="Step settings" className="input input-sm !font-mono" />
                  )}
                </li>
              );
            })}
            {steps.length === 0 && <li className="text-[13px] text-muted">No steps yet. Add the first one below.</li>}
          </ol>
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-muted" aria-hidden />
            <select aria-label="Add a step" value={picker} onChange={(e) => add(e.target.value)} className="select input-sm !w-auto">
              <option value="">Add a step...</option>
              {GROUPS.map((g) => <optgroup key={g} label={g}>{Object.entries(SPEC).filter(([, v]) => v.group === g).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</optgroup>)}
            </select>
            <span className="text-xs text-muted">Merge tags like {"{{first_name}}"} work in any message.</span>
          </div>
        </>
      )}
    </div>
  );
}
