"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace";
import { sendEmail, sendSms, toE164 } from "@/lib/messaging";
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
  const channel = String(fd.get("channel")) as "sms" | "email" | "whatsapp";
  const body = s(fd, "body");
  if (!body) return;
  const { data: c } = await db.from("contacts").select("*").eq("id", id).single();
  if (!c) return;
  if (channel === "email") await sendEmail(ws, c, s(fd, "subject") ?? `Message from ${ws.name}`, body);
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
