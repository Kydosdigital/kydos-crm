"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace";
import { sendEmail, sendSms, toE164, render } from "@/lib/messaging";
import { sendFromOutlook } from "@/lib/outlook";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fireTrigger } from "@/lib/automation";

const s = (fd: FormData, k: string) => (String(fd.get(k) ?? "").trim() || null);

// ───────── Auth & workspaces ─────────
export async function login(fd: FormData) {
  const db = await supabaseServer();
  const { error } = await db.auth.signInWithPassword({ email: String(fd.get("email")), password: String(fd.get("password")) });
  if (error) redirect("/login?error=" + encodeURIComponent(error.message));
  redirect("/contacts");
}

export async function logout() {
  await (await supabaseServer()).auth.signOut();
  redirect("/login");
}

export async function createWorkspace(fd: FormData) {
  const db = await supabaseServer();
  const name = s(fd, "name")!;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const { data, error } = await db.rpc("create_workspace", { p_name: name, p_slug: slug });
  if (error) redirect("/settings?error=" + encodeURIComponent(error.message));
  (await cookies()).set("ws", data as string, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/settings");
}

export async function switchWorkspace(fd: FormData) {
  (await cookies()).set("ws", String(fd.get("ws")), { path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/contacts");
}

export async function updateSettings(fd: FormData) {
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  await db
    .from("workspaces")
    .update({
      name: s(fd, "name") ?? ws.name,
      email_from: s(fd, "email_from"),
      sms_from: s(fd, "sms_from"),
      whatsapp_from: s(fd, "whatsapp_from"),
      business_address: s(fd, "business_address"),
      notify_email: s(fd, "notify_email"),
    })
    .eq("id", ws.id);
  revalidatePath("/settings");
}

// ───────── Contacts ─────────
export async function createContact(fd: FormData) {
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const tags = (s(fd, "tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const { data, error } = await db
    .from("contacts")
    .insert({
      workspace_id: ws.id,
      first_name: s(fd, "first_name"),
      last_name: s(fd, "last_name"),
      email: s(fd, "email"),
      phone: toE164(s(fd, "phone")),
      company: s(fd, "company"),
      source: "manual",
      tags,
      consent_note: s(fd, "consent_note"),
    })
    .select("id")
    .single();
  if (error || !data) redirect("/contacts?error=" + encodeURIComponent(error?.message ?? "failed"));
  await fireTrigger(ws.id, data.id, { type: "contact_created" });
  for (const tag of tags) await fireTrigger(ws.id, data.id, { type: "tag_added", tag });
  redirect(`/contacts/${data.id}`);
}

export async function addTag(fd: FormData) {
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const id = String(fd.get("contact_id"));
  const tag = s(fd, "tag");
  if (!tag) return;
  const { data: c } = await db.from("contacts").select("tags").eq("id", id).single();
  if (!c || c.tags.includes(tag)) return;
  await db.from("contacts").update({ tags: [...c.tags, tag] }).eq("id", id);
  await fireTrigger(ws.id, id, { type: "tag_added", tag });
  revalidatePath(`/contacts/${id}`);
}

export async function addNote(fd: FormData) {
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const id = String(fd.get("contact_id"));
  await db.from("notes").insert({ workspace_id: ws.id, contact_id: id, body: s(fd, "body")! });
  revalidatePath(`/contacts/${id}`);
}

export async function addTask(fd: FormData) {
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const id = String(fd.get("contact_id"));
  const due = s(fd, "due_at");
  await db.from("tasks").insert({ workspace_id: ws.id, contact_id: id, title: s(fd, "title")!, due_at: due ? new Date(due).toISOString() : null });
  revalidatePath(`/contacts/${id}`);
}

export async function toggleTask(fd: FormData) {
  const db = await supabaseServer();
  await db.from("tasks").update({ done: fd.get("done") === "true" }).eq("id", String(fd.get("id")));
  revalidatePath(`/contacts/${String(fd.get("contact_id"))}`);
}

// ───────── Messaging ─────────
export async function sendMessage(fd: FormData) {
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const id = String(fd.get("contact_id"));
  const channel = String(fd.get("channel")) as "sms" | "email" | "whatsapp" | "outlook";
  const body = s(fd, "body");
  if (!body) return;
  const { data: c } = await db.from("contacts").select("*").eq("id", id).single();
  if (!c) return;
  if (channel === "outlook") await sendFromOutlook(ws, c, s(fd, "subject") ?? `Message from ${ws.name}`, body);
  else if (channel === "email") await sendEmail(ws, c, s(fd, "subject") ?? `Message from ${ws.name}`, body);
  else await sendSms(ws, c, body, channel);
  revalidatePath(`/contacts/${id}`);
  revalidatePath("/inbox");
}

// ───────── Pipeline ─────────
export async function createOpportunity(fd: FormData) {
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const { data: stage } = await db.from("stages").select("id,pipeline_id").eq("id", String(fd.get("stage_id"))).single();
  if (!stage) return;
  await db.from("opportunities").insert({
    workspace_id: ws.id,
    contact_id: String(fd.get("contact_id")),
    pipeline_id: stage.pipeline_id,
    stage_id: stage.id,
    title: s(fd, "title") ?? "New opportunity",
    value: Number(fd.get("value") ?? 0) || 0,
  });
  revalidatePath("/pipeline");
}

export async function moveOpportunity(fd: FormData) {
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const stageId = String(fd.get("stage_id"));
  const oppId = String(fd.get("id"));
  const { data: stage } = await db.from("stages").select("name").eq("id", stageId).single();
  const status = stage?.name === "Won" ? "won" : stage?.name === "Lost" ? "lost" : "open";
  const { data: opp } = await db.from("opportunities").update({ stage_id: stageId, status }).eq("id", oppId).select("contact_id").single();
  if (opp) await fireTrigger(ws.id, opp.contact_id, { type: "stage_changed", stage_id: stageId });
  revalidatePath("/pipeline");
}

// ───────── Automations ─────────
// Steps are entered one per line: "send_email: Subject | Body", "wait: 48", "send_sms: Body",
// "add_tag: name", "create_task: title", "stop_if_replied"
export async function createAutomation(fd: FormData) {
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const triggerType = String(fd.get("trigger_type"));
  const triggerValue = s(fd, "trigger_value");
  const config =
    triggerType === "tag_added" ? { tag: triggerValue } : triggerType === "form_submitted" ? { form: triggerValue } : {};
  const { data: a } = await db
    .from("automations")
    .insert({ workspace_id: ws.id, name: s(fd, "name")!, trigger_type: triggerType, trigger_config: config })
    .select("id")
    .single();
  if (!a) return;
  const lines = String(fd.get("steps") ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const steps = lines.map((line, position) => {
    const [type, ...rest] = line.split(":");
    const arg = rest.join(":").trim();
    const t = type.trim();
    let config: Record<string, unknown> = {};
    if (t === "send_email") {
      const [subject, ...body] = arg.split("|");
      config = { subject: subject.trim(), body: body.join("|").trim() };
    } else if (t === "send_sms") config = { body: arg };
    else if (t === "wait") config = { hours: Number(arg) || 24 };
    else if (t === "add_tag" || t === "remove_tag") config = { tag: arg };
    else if (t === "create_task") config = { title: arg };
    else if (t === "notify") {
      const [subject, ...body] = arg.split("|");
      config = { subject: subject.trim(), body: body.join("|").trim() };
    } else if (t === "create_opportunity") {
      const [title, value, stage] = arg.split("|").map((x) => x.trim());
      config = { title: title || "New opportunity", value: Number(value) || 0, stage: stage || undefined };
    } else if (t === "wait_weekday") config = { hour: Number(arg) || 9 };
    else if (t === "enrol") config = { automation: arg };
    else if (t === "move_stage") config = { stage: arg };
    return { automation_id: a.id, workspace_id: ws.id, position, type: t, config };
  });
  if (steps.length) await db.from("automation_steps").insert(steps);
  revalidatePath("/automations");
}

export async function toggleAutomation(fd: FormData) {
  const db = await supabaseServer();
  await db.from("automations").update({ active: fd.get("active") === "true" }).eq("id", String(fd.get("id")));
  revalidatePath("/automations");
}

// ───────── Contact edit, delete, merge ─────────
export async function updateContact(fd: FormData) {
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const id = String(fd.get("contact_id"));
  const tags = (s(fd, "tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const { error } = await db.from("contacts").update({
    first_name: s(fd, "first_name"), last_name: s(fd, "last_name"), email: s(fd, "email"),
    phone: toE164(s(fd, "phone")), company: s(fd, "company"), tags, consent_note: s(fd, "consent_note"),
    email_opt_out: fd.get("email_opt_out") === "on", sms_opt_out: fd.get("sms_opt_out") === "on",
  }).eq("id", id).eq("workspace_id", ws.id);
  if (error) redirect(`/contacts/${id}?error=` + encodeURIComponent(error.message));
  redirect(`/contacts/${id}`);
}

export async function deleteContact(fd: FormData) {
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  await db.from("contacts").delete().eq("id", String(fd.get("contact_id"))).eq("workspace_id", ws.id);
  redirect("/contacts");
}

/** Merges another contact (found by email) into this one, then deletes the other. */
export async function mergeContact(fd: FormData) {
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const keepId = String(fd.get("contact_id"));
  const email = s(fd, "other_email");
  if (!email) redirect(`/contacts/${keepId}?error=Enter the email of the duplicate`);
  const { data: other } = await db.from("contacts").select("*").eq("workspace_id", ws.id).ilike("email", email!).maybeSingle();
  const { data: keep } = await db.from("contacts").select("*").eq("id", keepId).eq("workspace_id", ws.id).single();
  if (!other || !keep || other.id === keep.id) redirect(`/contacts/${keepId}?error=Duplicate not found`);
  const admin = supabaseAdmin();
  for (const t of ["messages", "notes", "tasks", "opportunities", "automation_runs"]) {
    await admin.from(t).update({ contact_id: keep.id }).eq("contact_id", other.id);
  }
  await admin.from("contacts").delete().eq("id", other.id);
  await admin.from("contacts").update({
    email: keep.email ?? other.email, phone: keep.phone ?? other.phone, company: keep.company ?? other.company,
    first_name: keep.first_name ?? other.first_name, last_name: keep.last_name ?? other.last_name,
    tags: Array.from(new Set([...(keep.tags ?? []), ...(other.tags ?? [])])),
    email_opt_out: keep.email_opt_out || other.email_opt_out, sms_opt_out: keep.sms_opt_out || other.sms_opt_out,
    consent_note: keep.consent_note ?? other.consent_note,
  }).eq("id", keep.id);
  redirect(`/contacts/${keep.id}`);
}

// ───────── Bulk email ─────────
export async function sendBroadcast(fd: FormData) {
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const tag = s(fd, "tag");
  const subject = s(fd, "subject");
  const body = s(fd, "body");
  if (!tag || !subject || !body) redirect("/broadcast?error=Tag, subject and message are all required");
  if (fd.get("confirm") !== "on") redirect(`/broadcast?tag=${encodeURIComponent(tag!)}&error=Tick the consent confirmation first`);
  const { data: list } = await db.from("contacts").select("*").eq("workspace_id", ws.id).contains("tags", [tag!]).eq("email_opt_out", false).not("email", "is", null).limit(90);
  let sent = 0;
  for (const c of list ?? []) {
    const r = await sendEmail(ws, c, render(subject!, c), render(body!, c));
    if (r.ok) sent++;
  }
  redirect(`/broadcast?done=${sent}`);
}

// ───────── Templates ─────────
export async function saveTemplate(fd: FormData) {
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  await db.from("email_templates").insert({ workspace_id: ws.id, name: s(fd, "name")!, subject: s(fd, "subject")!, body: s(fd, "body")! });
  revalidatePath("/templates");
}
export async function deleteTemplate(fd: FormData) {
  const db = await supabaseServer();
  await db.from("email_templates").delete().eq("id", String(fd.get("id")));
  revalidatePath("/templates");
}

// ───────── CSV import ─────────
function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.some((x) => x.trim())) rows.push(row); row = []; }
    else cur += ch;
  }
  row.push(cur);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

export async function importContacts(fd: FormData) {
  const { ws } = await requireWorkspace();
  const file = fd.get("file");
  const consent = s(fd, "consent_note");
  const extraTag = s(fd, "extra_tag");
  if (!(file instanceof File) || file.size === 0) redirect("/contacts/import?error=Choose a CSV file");
  const rows = parseCsv(await (file as File).text());
  const head = rows.shift()!.map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const idx = {
    first: col("first name", "first_name", "firstname"), last: col("last name", "last_name", "lastname"),
    name: col("name", "contact name", "full name"), email: col("email", "email address"),
    phone: col("phone", "phone number", "mobile"), company: col("company name", "company", "business name"),
    tags: col("tags", "tag"),
  };
  const db = supabaseAdmin();
  let created = 0, merged = 0, skipped = 0;
  for (const r of rows) {
    const g = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
    let first = g(idx.first), last = g(idx.last);
    if (!first && !last && idx.name >= 0) { const [f, ...l] = g(idx.name).split(" "); first = f ?? ""; last = l.join(" "); }
    const email = g(idx.email).toLowerCase() || null;
    const phone = toE164(g(idx.phone));
    if (!email && !phone) { skipped++; continue; }
    const tags = Array.from(new Set([...g(idx.tags).split(/[,;]/).map((t) => t.trim()).filter(Boolean), ...(extraTag ? [extraTag] : [])]));
    let existing = null;
    if (email) existing = (await db.from("contacts").select("*").eq("workspace_id", ws.id).ilike("email", email).maybeSingle()).data;
    if (!existing && phone) existing = (await db.from("contacts").select("*").eq("workspace_id", ws.id).eq("phone", phone).maybeSingle()).data;
    if (existing) {
      await db.from("contacts").update({ tags: Array.from(new Set([...(existing.tags ?? []), ...tags])), company: existing.company ?? (g(idx.company) || null) }).eq("id", existing.id);
      merged++;
    } else {
      await db.from("contacts").insert({ workspace_id: ws.id, first_name: first || null, last_name: last || null, email, phone, company: g(idx.company) || null, source: "import", tags, consent_note: consent });
      created++;
    }
  }
  redirect(`/contacts/import?done=${created}&merged=${merged}&skipped=${skipped}`);
}
