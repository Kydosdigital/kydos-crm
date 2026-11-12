// Converts between the one-line-per-step text used in the editor and the stored step rows.
// Newlines inside message bodies are written as \n so each step stays on one line.
const enc = (s: string) => s.replace(/\r/g, "").replace(/\n/g, "\\n");
const dec = (s: string) => s.replace(/\\n/g, "\n");

export type StepRow = { type: string; config: Record<string, unknown> };

export function parseSteps(text: string): StepRow[] {
  return text.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    const i = line.indexOf(":");
    const t = (i === -1 ? line : line.slice(0, i)).trim();
    const arg = i === -1 ? "" : line.slice(i + 1).trim();
    const pair = () => { const [a, ...b] = arg.split("|"); return [a.trim(), dec(b.join("|").trim())] as const; };
    let config: Record<string, unknown> = {};
    if (t === "send_email" || t === "notify") { const [subject, body] = pair(); config = { subject, body }; }
    else if (t === "send_sms") config = { body: dec(arg) };
    else if (t === "wait") config = { hours: Number(arg) || 24 };
    else if (t === "add_tag" || t === "remove_tag") config = { tag: arg };
    else if (t === "create_task") config = { title: arg };
    else if (t === "create_opportunity") { const [title, value, stage] = arg.split("|").map((x) => x.trim()); config = { title: title || "New opportunity", value: Number(value) || 0, stage: stage || undefined }; }
    else if (t === "wait_weekday") config = { hour: Number(arg) || 9 };
    else if (t === "enrol") config = { automation: arg };
    else if (t === "move_stage") config = { stage: arg };
    else if (t === "skip_if" || t === "skip_unless") { const [cond, n] = arg.split("|").map((x) => x.trim()); config = { cond, n: Number(n) || 1 }; }
    else if (t === "wait_until") { const [cond, hours] = arg.split("|").map((x) => x.trim()); config = { cond, hours: Number(hours) || 24 }; }
    else if (t === "wait_before") { const [hours, skip] = arg.split("|").map((x) => x.trim()); config = { hours: Number(hours) || 24, skip: Number(skip) || 0 }; }
    else if (t === "wait_after") config = { hours: Number(arg) || 1 };
    else if (t === "webhook") config = { url: arg };
    else if (t === "send_whatsapp") { const [template, ...vars] = arg.split("|").map((x) => x.trim()); config = { template, vars: vars.map(dec) }; }
    else if (arg.startsWith("{")) { try { config = JSON.parse(arg); } catch { /* keep empty */ } }
    return { type: t, config };
  });
}

export function stepsToText(steps: StepRow[]): string {
  return steps.map(({ type: t, config: c }) => {
    const g = (k: string) => String(c[k] ?? "");
    switch (t) {
      case "send_email": case "notify": return `${t}: ${g("subject")} | ${enc(g("body"))}`;
      case "send_sms": return `send_sms: ${enc(g("body"))}`;
      case "wait": return `wait: ${g("hours")}`;
      case "add_tag": case "remove_tag": return `${t}: ${g("tag")}`;
      case "create_task": return `create_task: ${g("title")}`;
      case "create_opportunity": return `create_opportunity: ${g("title")} | ${g("value")} | ${g("stage")}`;
      case "wait_weekday": return `wait_weekday: ${g("hour")}`;
      case "enrol": return `enrol: ${g("automation")}`;
      case "move_stage": return `move_stage: ${g("stage")}`;
      case "skip_if": case "skip_unless": return `${t}: ${g("cond")} | ${g("n")}`;
      case "wait_until": return `wait_until: ${g("cond")} | ${g("hours")}`;
      case "wait_before": return `wait_before: ${g("hours")} | ${g("skip")}`;
      case "wait_after": return `wait_after: ${g("hours")}`;
      case "webhook": return `webhook: ${g("url")}`;
      case "send_whatsapp": return `send_whatsapp: ${[g("template"), ...((c.vars as string[]) ?? []).map((v) => enc(String(v)))].join(" | ")}`;
      case "stop_if_replied": case "end": return t;
      default: return Object.keys(c).length ? `${t}: ${JSON.stringify(c)}` : t;
    }
  }).join("\n");
}

export function triggerConfig(type: string, value: string | null): Record<string, unknown> {
  if (type === "tag_added") return { tag: value };
  if (type === "form_submitted") return { form: value };
  if (type === "date_reached") { const [field, off, yr] = (value ?? "").split(",").map((x) => x.trim()); return { field, offset_days: off || "0", yearly: yr === "yearly" ? "1" : "0" }; }
  return {};
}
export function triggerValue(type: string, c: Record<string, unknown>): string {
  if (type === "tag_added") return String(c.tag ?? "");
  if (type === "form_submitted") return String(c.form ?? "");
  if (type === "date_reached") return [c.field, c.offset_days ?? "0", c.yearly === "1" ? "yearly" : ""].filter((x) => x !== "").join(", ");
  return "";
}
