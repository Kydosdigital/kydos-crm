"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { requireWorkspace, requireStaff, requireAdmin } from "@/lib/workspace";
import { sendEmail, sendSms, toE164 } from "@/lib/messaging";
import { sendFromOutlook } from "@/lib/outlook";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fireTrigger } from "@/lib/automation";
import { sendMetaEvent } from "@/lib/capi";
import { logActivity } from "@/lib/log";

const s = (fd: FormData, k: string) => (String(fd.get(k) ?? "").trim() || null);

/** True only when the contact exists inside the given workspace (KD-049). */
async function contactInWorkspace(db: Awaited<ReturnType<typeof supabaseServer>>, wsId: string, contactId: string) {
  const { data } = await db.from("contacts").select("id").eq("id", contactId).eq("workspace_id", wsId).maybeSingle();
  return !!data;
}

// ───────── Auth & workspaces ─────────
export async function login(fd: FormData) {
  const db = await supabaseServer();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!email || !password) redirect("/login?error=invalid");
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    if (error?.code === "email_not_confirmed") redirect("/login?error=verify");
    if (error?.status === 429) redirect("/login?error=limited");
    redirect("/login?error=invalid");
  }
  const { data: member, error: memberError } = await db.from("workspace_members")
    .select("workspace_id").eq("user_id", data.user.id).limit(1);
  if (memberError || !member?.length) redirect("/onboarding");
  redirect("/contacts");
}

export async function requestLink(fd: FormData) {
  const kind = fd.get("kind") === "reset" ? "reset" : "login";
  const email = String(fd.get("email") ?? "").trim();
  if (email) await (await import("@/lib/authmail")).sendAuthLink(email, kind);
  redirect("/login?sent=1");
}
export async function requestAccess(fd: FormData) {
  const name = String(fd.get("name") ?? "").trim().slice(0, 80);
  const email = String(fd.get("email") ?? "").trim().slice(0, 120);
  if (!fd.get("website") && name && email) {
    const { data: ws } = await supabaseAdmin().from("workspaces").select("id").order("created_at").limit(1).single();
    if (ws) await (await import("@/lib/notify")).notifyOwner(ws.id, "CRM access requested", `${name} (${email}) asked for access. Approve them under Team, Invite.`);
  }
  redirect("/signup?sent=1");
}
export async function setPassword(fd: FormData) {
  const db = await supabaseServer();
  const { error } = await db.auth.updateUser({ password: String(fd.get("password")) });
  if (error) redirect("/set-password?error=" + encodeURIComponent(error.message));
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
  const { ws } = await requireAdmin();
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
      booking_link: s(fd, "booking_link"),
      review_link: s(fd, "review_link"),
      meta_dataset_id: s(fd, "meta_dataset_id"),
      brand_color: /^#[0-9a-fA-F]{6}$/.test(s(fd, "brand_color") ?? "") ? s(fd, "brand_color") : "#0e5a48",
      logo_url: s(fd, "logo_url"),
      email_signature: s(fd, "email_signature"),
      reply_to: s(fd, "reply_to"),
      website_url: s(fd, "website_url"),
      call_number: s(fd, "call_number"),
      call_forward_number: s(fd, "call_forward_number"),
      missed_call_template: s(fd, "missed_call_template"),
      missed_call_text: s(fd, "missed_call_text"),
    })
    .eq("id", ws.id);
  revalidatePath("/settings");
}

// ───────── Contacts ─────────
export async function createContact(fd: FormData) {
  const { ws } = await requireStaff();
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
  const { ws } = await requireStaff();
  const db = await supabaseServer();
  const id = String(fd.get("contact_id"));
  const tag = s(fd, "tag");
  if (!tag) return;
  if (!(await contactInWorkspace(db, ws.id, id))) return;
  const { data: c } = await db.from("contacts").select("tags").eq("id", id).eq("workspace_id", ws.id).single();
  if (!c || c.tags.includes(tag)) return;
  await db.from("contacts").update({ tags: [...c.tags, tag] }).eq("id", id).eq("workspace_id", ws.id);
  await fireTrigger(ws.id, id, { type: "tag_added", tag });
  revalidatePath(`/contacts/${id}`);
}

export async function addNote(fd: FormData) {
  const { ws } = await requireStaff();
  const db = await supabaseServer();
  const id = String(fd.get("contact_id"));
  if (!(await contactInWorkspace(db, ws.id, id))) return;
  await db.from("notes").insert({ workspace_id: ws.id, contact_id: id, body: s(fd, "body")! });
  revalidatePath(`/contacts/${id}`);
}

export async function addTask(fd: FormData) {
  const { ws } = await requireStaff();
  const db = await supabaseServer();
  const id = String(fd.get("contact_id"));
  const due = s(fd, "due_at");
  if (!(await contactInWorkspace(db, ws.id, id))) return;
  await db.from("tasks").insert({ workspace_id: ws.id, contact_id: id, title: s(fd, "title")!, due_at: due ? new Date(due).toISOString() : null });
  revalidatePath(`/contacts/${id}`);
}

export async function toggleTask(fd: FormData) {
  const { ws } = await requireStaff();
  const db = await supabaseServer();
  await db.from("tasks").update({ done: fd.get("done") === "true" }).eq("id", String(fd.get("id"))).eq("workspace_id", ws.id);
  revalidatePath(`/contacts/${String(fd.get("contact_id"))}`);
}

// ───────── Messaging ─────────
export async function sendMessage(fd: FormData) {
  const { ws } = await requireStaff();
  const db = await supabaseServer();
  const id = String(fd.get("contact_id"));
  const channel = String(fd.get("channel")) as "sms" | "email" | "whatsapp" | "outlook" | "messenger" | "instagram";
  const body = s(fd, "body");
  if (!body) return;
  const { data: c } = await db.from("contacts").select("*").eq("id", id).eq("workspace_id", ws.id).single();
  if (!c) return;
  if (channel === "outlook") await sendFromOutlook(ws, c, s(fd, "subject") ?? `Message from ${ws.name}`, body);
  else if (channel === "email") await sendEmail(ws, c, s(fd, "subject") ?? `Message from ${ws.name}`, body);
  else if (channel === "messenger" || channel === "instagram") await (await import("@/lib/social")).sendSocialDM(ws.id, c, channel, body);
  else await sendSms(ws, c, body, channel);
  await logActivity(ws.id, "user", `sent ${channel}`, "contact", id);
  revalidatePath(`/contacts/${id}`);
  revalidatePath("/inbox");
}

// ───────── Pipeline ─────────
export async function createOpportunity(fd: FormData) {
  const { ws } = await requireStaff();
  const db = await supabaseServer();
  const { data: stage } = await db.from("stages").select("id,pipeline_id").eq("id", String(fd.get("stage_id"))).single();
  if (!stage) return;
  if (!(await contactInWorkspace(db, ws.id, String(fd.get("contact_id"))))) return;
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

export async function createPipeline(fd: FormData) {
  const { ws } = await requireAdmin();
  const db = await supabaseServer();
  const name = s(fd, "name");
  if (!name) redirect("/pipeline?error=" + encodeURIComponent("Give the pipeline a name."));
  const names = String(fd.get("stages") ?? "").split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
  const open = names.filter((x) => !["won", "lost"].includes(x.toLowerCase()));
  const all = [...(open.length ? open : ["New", "Contacted", "Proposal"]), "Won", "Lost"];
  const { data: p } = await db.from("pipelines").insert({ workspace_id: ws.id, name }).select("id").single();
  if (!p) redirect("/pipeline?error=" + encodeURIComponent("Could not create the pipeline."));
  await db.from("stages").insert(all.map((n, i) => ({ workspace_id: ws.id, pipeline_id: p.id, name: n, position: i })));
  await logActivity(ws.id, "user", `created pipeline ${name}`, "pipeline", p.id);
  revalidatePath("/pipeline");
  redirect("/pipeline?p=" + p.id);
}

export async function deletePipeline(fd: FormData) {
  const { ws } = await requireAdmin();
  const db = await supabaseServer();
  const id = String(fd.get("id"));
  const { count } = await db.from("opportunities").select("id", { count: "exact", head: true }).eq("pipeline_id", id);
  if ((count ?? 0) > 0) redirect("/pipeline?p=" + id + "&error=" + encodeURIComponent("Move or delete this pipeline's opportunities first."));
  const { count: total } = await db.from("pipelines").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id);
  if ((total ?? 0) <= 1) redirect("/pipeline?error=" + encodeURIComponent("You need at least one pipeline."));
  await db.from("pipelines").delete().eq("id", id).eq("workspace_id", ws.id);
  revalidatePath("/pipeline");
  redirect("/pipeline");
}

export async function moveOpportunity(fd: FormData) {
  const { ws } = await requireStaff();
  const db = await supabaseServer();
  const stageId = String(fd.get("stage_id"));
  const oppId = String(fd.get("id"));
  const { data: stage } = await db.from("stages").select("name").eq("id", stageId).single();
  const status = stage?.name === "Won" ? "won" : stage?.name === "Lost" ? "lost" : "open";
  const { data: opp } = await db.from("opportunities").update({ stage_id: stageId, status, closed_at: status === "open" ? null : new Date().toISOString() }).eq("id", oppId).select("contact_id,value").single();
  if (opp) {
    await fireTrigger(ws.id, opp.contact_id, { type: "stage_changed", stage_id: stageId });
    if (status === "won" || status === "lost") await fireTrigger(ws.id, opp.contact_id, { type: status === "won" ? "deal_won" : "deal_lost" });
    if (status === "won") await sendMetaEvent(ws.id, opp.contact_id, "Purchase", Number(opp.value) || undefined);
    await logActivity(ws.id, "user", `moved deal to ${stage?.name}`, "opportunity", oppId);
  }
  revalidatePath("/pipeline");
}

// ───────── Automations ─────────
// Steps are entered one per line: "send_email: Subject | Body", "wait: 48", "send_sms: Body",
// "add_tag: name", "create_task: title", "stop_if_replied"
export async function createAutomation(fd: FormData) {
  const { ws } = await requireAdmin();
  const db = await supabaseServer();
  const { parseSteps, triggerConfig } = await import("@/lib/automationSteps");
  const triggerType = String(fd.get("trigger_type"));
  const { data: a } = await db
    .from("automations")
    .insert({ workspace_id: ws.id, name: s(fd, "name")!, trigger_type: triggerType, trigger_config: triggerConfig(triggerType, s(fd, "trigger_value")) })
    .select("id")
    .single();
  if (!a) return;
  const steps = parseSteps(String(fd.get("steps") ?? "")).map((st, position) => ({ automation_id: a.id, workspace_id: ws.id, position, ...st }));
  if (steps.length) await db.from("automation_steps").insert(steps);
  revalidatePath("/automations");
}

/** Creates a paused automation from a ready-made preset. */
export async function createFromPreset(fd: FormData) {
  const { ws } = await requireAdmin();
  const db = await supabaseServer();
  const { PRESETS } = await import("@/lib/automationPresets");
  const { parseSteps, triggerConfig } = await import("@/lib/automationSteps");
  const pr = PRESETS.find((x) => x.key === String(fd.get("key")));
  if (!pr) return;
  const { data: a } = await db.from("automations").insert({ workspace_id: ws.id, name: pr.name, trigger_type: pr.trigger_type, trigger_config: triggerConfig(pr.trigger_type, pr.trigger_value), active: false }).select("id").single();
  if (!a) return;
  const steps = parseSteps(pr.steps).map((st, position) => ({ automation_id: a.id, workspace_id: ws.id, position, ...st }));
  if (steps.length) await db.from("automation_steps").insert(steps);
  redirect(`/automations/${a.id}`);
}

/** Edits an automation in place: name, trigger and the whole step list. Contacts already mid-run carry on at their current step number. */
export async function updateAutomation(fd: FormData) {
  const { ws } = await requireAdmin();
  const db = await supabaseServer();
  const { parseSteps, triggerConfig } = await import("@/lib/automationSteps");
  const id = String(fd.get("id"));
  const triggerType = String(fd.get("trigger_type"));
  const { error } = await db.from("automations").update({ name: s(fd, "name")!, trigger_type: triggerType, trigger_config: triggerConfig(triggerType, s(fd, "trigger_value")) }).eq("id", id).eq("workspace_id", ws.id);
  if (error) redirect(`/automations/${id}?error=` + encodeURIComponent(error.message));
  const steps = parseSteps(String(fd.get("steps") ?? "")).map((st, position) => ({ automation_id: id, workspace_id: ws.id, position, ...st }));
  await db.from("automation_steps").delete().eq("automation_id", id).eq("workspace_id", ws.id);
  if (steps.length) {
    const { error: e2 } = await db.from("automation_steps").insert(steps);
    if (e2) redirect(`/automations/${id}?error=` + encodeURIComponent(e2.message));
  }
  await logActivity(ws.id, "user", "edited automation", "automation", id);
  revalidatePath("/automations");
  redirect("/automations?saved=1");
}
export async function deleteAutomation(fd: FormData) {
  const { ws } = await requireAdmin();
  const id = String(fd.get("id"));
  await (await supabaseServer()).from("automations").delete().eq("id", id).eq("workspace_id", ws.id);
  await logActivity(ws.id, "user", "deleted automation", "automation", id);
  redirect("/automations");
}
export async function duplicateAutomation(fd: FormData) {
  const { ws } = await requireAdmin();
  const db = await supabaseServer();
  const id = String(fd.get("id"));
  const { data: a } = await db.from("automations").select("*").eq("id", id).eq("workspace_id", ws.id).single();
  if (!a) return;
  const { data: n } = await db.from("automations").insert({ workspace_id: ws.id, name: `${a.name} (copy)`, trigger_type: a.trigger_type, trigger_config: a.trigger_config, active: false }).select("id").single();
  const { data: st } = await db.from("automation_steps").select("*").eq("automation_id", id).order("position");
  if (n && st?.length) await db.from("automation_steps").insert(st.map((x) => ({ automation_id: n.id, workspace_id: ws.id, position: x.position, type: x.type, config: x.config })));
  revalidatePath("/automations");
}

export async function toggleAutomation(fd: FormData) {
  await requireAdmin();
  const db = await supabaseServer();
  await db.from("automations").update({ active: fd.get("active") === "true" }).eq("id", String(fd.get("id")));
  revalidatePath("/automations");
}

// ───────── Contact edit, delete, merge ─────────
export async function updateContact(fd: FormData) {
  const { ws } = await requireStaff();
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
  const { ws } = await requireAdmin();
  const db = await supabaseServer();
  await db.from("contacts").delete().eq("id", String(fd.get("contact_id"))).eq("workspace_id", ws.id);
  redirect("/contacts");
}

/** Merges another contact (found by email) into this one, then deletes the other. */
export async function mergeContact(fd: FormData) {
  const { ws } = await requireStaff();
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

// ───────── Bulk campaigns (email, SMS, WhatsApp) ─────────
export async function sendBroadcast(fd: FormData) {
  const { ws } = await requireStaff();
  const db = await supabaseServer();
  const channel = (["sms", "whatsapp"].includes(String(fd.get("channel"))) ? String(fd.get("channel")) : "email") as "email" | "sms" | "whatsapp";
  const tag = s(fd, "tag");
  const listId = s(fd, "list");
  const subject = s(fd, "subject");
  const body = s(fd, "body");
  const template = s(fd, "wa_template");
  const back = `/broadcast?${listId ? `list=${listId}` : `tag=${encodeURIComponent(tag ?? "")}`}&channel=${channel}`;
  if ((!tag && !listId) || !body && channel !== "whatsapp" || (channel === "email" && !subject) || (channel === "whatsapp" && !template)) redirect(`${back}&error=Audience and the message fields are required`);
  if (fd.get("confirm") !== "on") redirect(`${back}&error=Tick the consent confirmation first`);
  const msg = { channel, subject, body, wa_template: template, wa_lang: s(fd, "wa_lang") || "en_GB" };
  const sendAt = s(fd, "send_at");
  if (sendAt) {
    const when = new Date(new Date(sendAt + "Z").getTime() - londonOffsetMs(sendAt));
    await db.from("scheduled_sends").insert({ workspace_id: ws.id, tag: listId ? null : tag, list_id: listId || null, send_at: when.toISOString(), repeat: ["weekly","fortnightly","monthly"].includes(String(fd.get("repeat"))) ? String(fd.get("repeat")) : "none", ...msg });
    await logActivity(ws.id, "user", `scheduled ${channel} campaign`, "broadcast", undefined, subject ?? template ?? body?.slice(0, 40));
    redirect(`/broadcast?scheduled=1`);
  }
  const { audience, deliver } = await import("@/lib/campaign");
  const { people } = await audience(ws.id, { tag, listId }, channel);
  let sent = 0;
  for (const c of people) if ((await deliver(ws, c, msg)).ok) sent++;
  await logActivity(ws.id, "user", `sent ${channel} campaign`, "broadcast", undefined, `${sent} of ${people.length} sent`);
  redirect(`/broadcast?done=${sent}&of=${people.length}`);
}

/** Offset of Europe/London from UTC at a given local datetime-local string (handles BST). */
function londonOffsetMs(local: string) {
  const asUtc = new Date(local + "Z");
  const london = new Date(asUtc.toLocaleString("en-US", { timeZone: "Europe/London" }));
  const utc = new Date(asUtc.toLocaleString("en-US", { timeZone: "UTC" }));
  return london.getTime() - utc.getTime();
}
export async function cancelScheduled(fd: FormData) {
  await requireStaff();
  await (await supabaseServer()).from("scheduled_sends").update({ status: "cancelled" }).eq("id", String(fd.get("id"))).eq("status", "scheduled");
  revalidatePath("/broadcast");
}

// ───────── Templates ─────────
export async function saveTemplate(fd: FormData) {
  const { ws } = await requireStaff();
  const db = await supabaseServer();
  await db.from("email_templates").insert({ workspace_id: ws.id, name: s(fd, "name")!, subject: s(fd, "subject")!, body: s(fd, "body")! });
  revalidatePath("/templates");
}
export async function deleteTemplate(fd: FormData) {
  await requireStaff();
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
  const { ws } = await requireStaff();
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

// ───────── Knowledge base and agent ─────────
import { sendDraft, draftFor, agentAvailable } from "@/lib/agent";
import { loadEngagement, analyse } from "@/lib/engagement";

export async function saveKnowledge(fd: FormData) {
  const { ws } = await requireStaff();
  const db = await supabaseServer();
  const id = s(fd, "id");
  const row = { workspace_id: ws.id, kind: String(fd.get("kind")), title: s(fd, "title") ?? "Untitled", body: s(fd, "body") ?? "" };
  if (id) await db.from("knowledge_items").update(row).eq("id", id);
  else await db.from("knowledge_items").insert(row);
  revalidatePath("/knowledge");
}
export async function deleteKnowledge(fd: FormData) {
  await requireStaff();
  await (await supabaseServer()).from("knowledge_items").delete().eq("id", String(fd.get("id")));
  revalidatePath("/knowledge");
}
export async function toggleKnowledge(fd: FormData) {
  await requireStaff();
  await (await supabaseServer()).from("knowledge_items").update({ active: fd.get("active") === "true" }).eq("id", String(fd.get("id")));
  revalidatePath("/knowledge");
}

export async function createDraft(fd: FormData) {
  const { ws } = await requireStaff();
  const db = await supabaseServer();
  const body = s(fd, "body");
  if (!body) return;
  if (!(await contactInWorkspace(db, ws.id, String(fd.get("contact_id"))))) return;
  await db.from("agent_drafts").insert({
    workspace_id: ws.id, contact_id: String(fd.get("contact_id")), channel: String(fd.get("channel")), subject: s(fd, "subject"), body,
    state: s(fd, "state"), tactic: s(fd, "tactic"), source: "manual", status: "pending",
  });
  revalidatePath("/agent");
}
export async function editDraft(fd: FormData) {
  await requireStaff();
  await (await supabaseServer()).from("agent_drafts").update({ subject: s(fd, "subject"), body: s(fd, "body") ?? "" }).eq("id", String(fd.get("id"))).eq("status", "pending");
  revalidatePath("/agent");
}
export async function approveDraft(fd: FormData) {
  const { ws } = await requireStaff();
  const db = await supabaseServer();
  const id = String(fd.get("id"));
  const { data: d } = await db.from("agent_drafts").select("id").eq("id", id).maybeSingle(); // RLS check: draft belongs to this workspace
  if (!d) return;
  await sendDraft(ws as never, id);
  revalidatePath("/agent");
}
export async function rejectDraft(fd: FormData) {
  await requireStaff();
  await (await supabaseServer()).from("agent_drafts").update({ status: "rejected", decided_at: new Date().toISOString() }).eq("id", String(fd.get("id")));
  revalidatePath("/agent");
}
export async function setAgentMode(fd: FormData) {
  const { ws } = await requireAdmin();
  await (await supabaseServer()).from("workspaces").update({ agent_mode: String(fd.get("mode")) }).eq("id", ws.id);
  revalidatePath("/agent");
}
export async function askAgentToDraft(fd: FormData) {
  const { ws } = await requireStaff();
  if (!agentAvailable()) return;
  const { msgs, events, contacts } = await loadEngagement(ws.id, 60);
  const row = analyse(msgs, events, contacts).rows.find((r) => r.contact.id === String(fd.get("contact_id")));
  if (row) await draftFor(ws as never, row.contact.id, row.state);
  revalidatePath("/agent");
}


// ───────── Custom fields, smart lists, bookings ─────────
export async function saveField(fd: FormData) {
  const { ws } = await requireAdmin();
  const label = s(fd, "label");
  if (!label) return;
  const key = (s(fd, "key") ?? label).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const options = (s(fd, "options") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  await (await supabaseServer()).from("custom_fields").upsert({ workspace_id: ws.id, key, label, type: String(fd.get("type") ?? "text"), options }, { onConflict: "workspace_id,key" });
  revalidatePath("/lists");
}
export async function deleteField(fd: FormData) {
  await requireAdmin();
  await (await supabaseServer()).from("custom_fields").delete().eq("id", String(fd.get("id")));
  revalidatePath("/lists");
}
export async function saveCustomValues(fd: FormData) {
  const { ws } = await requireStaff();
  const db = await supabaseServer();
  const id = String(fd.get("contact_id"));
  const { data: fields } = await db.from("custom_fields").select("key").eq("workspace_id", ws.id);
  const custom: Record<string, string> = {};
  for (const f of fields ?? []) { const v = s(fd, `cf_${f.key}`); if (v) custom[f.key] = v; }
  await db.from("contacts").update({ custom }).eq("id", id).eq("workspace_id", ws.id);
  revalidatePath(`/contacts/${id}`);
}
export async function saveList(fd: FormData) {
  const { ws } = await requireStaff();
  const split = (k: string) => (s(fd, k) ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const filter = {
    tags_any: split("tags_any"), tags_all: split("tags_all"), tags_none: split("tags_none"),
    source: s(fd, "source") ?? undefined, state: s(fd, "state") ?? undefined,
    has_email: fd.get("has_email") === "on", has_phone: fd.get("has_phone") === "on",
    created_within_days: Number(fd.get("created_within_days")) || undefined,
    field: s(fd, "field") ?? undefined, q: s(fd, "q") ?? undefined,
  };
  await (await supabaseServer()).from("smart_lists").insert({ workspace_id: ws.id, name: s(fd, "name") ?? "List", filter });
  revalidatePath("/lists");
}
export async function deleteList(fd: FormData) {
  await requireStaff();
  await (await supabaseServer()).from("smart_lists").delete().eq("id", String(fd.get("id")));
  revalidatePath("/lists");
}
export async function enrolList(fd: FormData) {
  const { ws } = await requireStaff();
  const { matchList } = await import("@/lib/lists");
  const db = await supabaseServer();
  const { data: l } = await db.from("smart_lists").select("*").eq("id", String(fd.get("list_id"))).eq("workspace_id", ws.id).single();
  const autoId = String(fd.get("automation_id"));
  if (!l || !autoId) return;
  const people = await matchList(ws.id, l.filter);
  const admin = supabaseAdmin();
  let n = 0;
  for (const c of people.slice(0, 500)) {
    const { data: active } = await admin.from("automation_runs").select("id").eq("automation_id", autoId).eq("contact_id", c.id).eq("status", "active").maybeSingle();
    if (!active) { await admin.from("automation_runs").insert({ workspace_id: ws.id, automation_id: autoId, contact_id: c.id }); n++; }
  }
  redirect(`/lists?enrolled=${n}`);
}
export async function setBookingOutcome(fd: FormData) {
  const { ws } = await requireStaff();
  const id = String(fd.get("booking_id"));
  await (await supabaseServer()).from("bookings").update({ status: String(fd.get("status")) }).eq("id", id).eq("workspace_id", ws.id);
  revalidatePath(`/contacts/${String(fd.get("contact_id"))}`);
}

// ───────── Hosted forms ─────────
const parseFieldLines = (txt: string) =>
  txt.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const [key, label, type, req] = l.split("|").map((x) => x.trim());
    return { key: key.toLowerCase().replace(/[^a-z0-9_]/g, "_"), label: label || key, type: ["text", "email", "tel", "textarea", "number", "date"].includes(type) ? type : "text", required: /^(r|req|required|yes|true)/i.test(req ?? "") };
  });

export async function saveForm(fd: FormData) {
  const { ws } = await requireAdmin();
  const slug = (s(fd, "slug") ?? "contact").toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const fields = parseFieldLines(String(fd.get("fields") ?? ""));
  if (!fields.some((f) => f.key === "email" || f.key === "phone")) redirect("/forms?error=Include an email or phone field");
  const row = {
    workspace_id: ws.id, slug, name: s(fd, "name") ?? slug, headline: s(fd, "headline") ?? "Get in touch", intro: s(fd, "intro"),
    button_text: s(fd, "button_text") ?? "Send", success_message: s(fd, "success_message") ?? "Thanks, we will be in touch shortly.",
    consent_text: s(fd, "consent_text") ?? "I agree to be contacted by email and WhatsApp about my enquiry.",
    tags: (s(fd, "tags") ?? "").split(",").map((x) => x.trim()).filter(Boolean), fields,
    exit_intent: fd.get("exit_intent") === "on", popup_delay_seconds: Number(fd.get("popup_delay_seconds")) || 0, active: true,
  };
  await (await supabaseServer()).from("hosted_forms").upsert(row, { onConflict: "workspace_id,slug" });
  await logActivity(ws.id, "user", "saved form", "form", slug);
  revalidatePath("/forms");
}
export async function toggleForm(fd: FormData) {
  await requireAdmin();
  await (await supabaseServer()).from("hosted_forms").update({ active: fd.get("active") === "1" }).eq("id", String(fd.get("id")));
  revalidatePath("/forms");
}
export async function deleteForm(fd: FormData) {
  await requireAdmin();
  await (await supabaseServer()).from("hosted_forms").delete().eq("id", String(fd.get("id")));
  revalidatePath("/forms");
}

// ───────── Calls ─────────
export async function callContact(fd: FormData) {
  const { ws } = await requireStaff();
  const db = await supabaseServer();
  const id = String(fd.get("contact_id"));
  const { data: c } = await db.from("contacts").select("id,phone").eq("id", id).eq("workspace_id", ws.id).single();
  let msg = "Call started: your phone will ring first";
  if (!c) msg = "Contact not found";
  else {
    const { startCall } = await import("@/lib/calls");
    const r = await startCall(ws, c).catch((e) => ({ ok: false as const, error: String(e) }));
    if (!r.ok) msg = r.error;
  }
  redirect(`/contacts/${id}?msg=${encodeURIComponent(msg)}`);
}

// ───────── Team ─────────
export async function inviteMember(fd: FormData) {
  const { ws } = await requireAdmin();
  const email = (s(fd, "email") ?? "").toLowerCase();
  const role = fd.get("role") === "admin" ? "admin" : fd.get("role") === "client" ? "client" : "member";
  if (!email) redirect("/team?error=Enter an email");
  const admin = supabaseAdmin();
  const sent = await (await import("@/lib/authmail")).sendAuthLink(email, "invite", ws.id);
  const userId = sent.ok ? sent.userId : undefined;
  if (!userId) redirect("/team?error=" + encodeURIComponent(sent.ok ? "Could not invite that email" : sent.error));
  await admin.from("workspace_members").upsert({ workspace_id: ws.id, user_id: userId, role }, { onConflict: "workspace_id,user_id" });
  await logActivity(ws.id, "user", `invited ${email} as ${role}`, "team");
  redirect("/team?done=1");
}
export async function removeMember(fd: FormData) {
  const { ws } = await requireAdmin();
  const uid = String(fd.get("user_id"));
  await supabaseAdmin().from("workspace_members").delete().eq("workspace_id", ws.id).eq("user_id", uid).neq("role", "owner");
  await logActivity(ws.id, "user", "removed team member", "team", uid);
  revalidatePath("/team");
}
export async function assignContact(fd: FormData) {
  const { ws } = await requireStaff();
  const id = String(fd.get("contact_id"));
  await (await supabaseServer()).from("contacts").update({ owner_id: String(fd.get("owner_id")) || null }).eq("id", id).eq("workspace_id", ws.id);
  revalidatePath(`/contacts/${id}`);
}

// ───────── Snippets ─────────
export async function saveSnippet(fd: FormData) {
  const { ws } = await requireStaff();
  await (await supabaseServer()).from("snippets").insert({ workspace_id: ws.id, name: s(fd, "name")!, body: s(fd, "body")! });
  revalidatePath("/snippets");
}
export async function deleteSnippet(fd: FormData) {
  await requireStaff();
  await (await supabaseServer()).from("snippets").delete().eq("id", String(fd.get("id")));
  revalidatePath("/snippets");
}

// ───────── Task board ─────────
export async function assignTask(fd: FormData) {
  const { ws } = await requireStaff();
  await (await supabaseServer()).from("tasks").update({ assigned_to: String(fd.get("user_id")) || null }).eq("id", String(fd.get("id"))).eq("workspace_id", ws.id);
  revalidatePath("/tasks");
}
export async function toggleTaskBoard(fd: FormData) {
  const { ws } = await requireStaff();
  await (await supabaseServer()).from("tasks").update({ done: fd.get("done") === "true" }).eq("id", String(fd.get("id"))).eq("workspace_id", ws.id);
  revalidatePath("/tasks");
}

// ───────── Invoices ─────────
export async function createInvoice(fd: FormData) {
  const { ws } = await requireStaff();
  const db = await supabaseServer();
  const contactId = String(fd.get("contact_id"));
  const kind = fd.get("kind") === "estimate" ? "estimate" : "invoice";
  const { count } = await db.from("invoices").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id);
  const number = `${kind === "estimate" ? "EST" : "INV"}-${String((count ?? 0) + 1).padStart(4, "0")}`;
  if (!(await contactInWorkspace(db, ws.id, contactId))) redirect("/invoices?error=" + encodeURIComponent("Contact not found"));
  const { data: c } = await db.from("contacts").select("email").eq("id", contactId).eq("workspace_id", ws.id).single();
  const row = { workspace_id: ws.id, contact_id: contactId, number, kind, description: s(fd, "description") ?? "Services", amount_gbp: Number(fd.get("amount")) || 0, due_date: s(fd, "due_date") };
  const { data: inv, error } = await db.from("invoices").insert(row).select("id").single();
  if (error || !inv) redirect("/invoices?error=" + encodeURIComponent(error?.message ?? "Could not create"));
  let note = "";
  if (kind === "invoice") {
    try {
      const link = await (await import("@/lib/stripe")).createPayLink({ id: inv.id, number, description: row.description, amount_gbp: row.amount_gbp, email: c?.email });
      if (link) await db.from("invoices").update({ pay_url: link.url, stripe_session_id: link.sessionId }).eq("id", inv.id);
      else note = "Created without a payment link: add STRIPE_SECRET_KEY in Vercel.";
    } catch (e) { note = "Stripe: " + String(e); }
  }
  await logActivity(ws.id, "user", `created ${kind} ${number}`, "invoice", inv.id);
  redirect("/invoices" + (note ? `?error=${encodeURIComponent(note)}` : ""));
}
export async function sendInvoice(fd: FormData) {
  const { ws } = await requireStaff();
  const db = await supabaseServer();
  const { data: inv } = await db.from("invoices").select("*").eq("id", String(fd.get("id"))).single();
  if (!inv) return;
  const { data: c } = await db.from("contacts").select("*").eq("id", inv.contact_id).single();
  if (!c) return;
  const due = inv.due_date ? ` Due ${inv.due_date}.` : "";
  const body = inv.kind === "estimate"
    ? `Hi ${c.first_name || "there"},\n\nHere is your estimate ${inv.number}: ${inv.description}, £${Number(inv.amount_gbp).toFixed(2)}.\n\nReply to this email to accept it and we will get started.\n\nBest wishes,\n${ws.name}`
    : `Hi ${c.first_name || "there"},\n\nInvoice ${inv.number}: ${inv.description}, £${Number(inv.amount_gbp).toFixed(2)}.${due}\n\n${inv.pay_url ? `Pay securely online: ${inv.pay_url}` : "Reply to this email for payment details."}\n\nThank you,\n${ws.name}`;
  const r = await sendEmail(ws, c, `${inv.kind === "estimate" ? "Estimate" : "Invoice"} ${inv.number} from ${ws.name}`, body);
  if (r.ok) await db.from("invoices").update({ status: "sent" }).eq("id", inv.id);
  revalidatePath("/invoices");
}
export async function setInvoiceStatus(fd: FormData) {
  await requireStaff();
  const status = String(fd.get("status"));
  await (await supabaseServer()).from("invoices").update({ status, ...(status === "paid" ? { paid_at: new Date().toISOString() } : {}) }).eq("id", String(fd.get("id")));
  revalidatePath("/invoices");
}

// ───────── Retainers (monthly card subscriptions) ─────────
export async function createRetainer(fd: FormData) {
  const { ws } = await requireStaff();
  await requireAdmin();
  const db = await supabaseServer();
  const contactId = String(fd.get("contact_id"));
  if (!(await contactInWorkspace(db, ws.id, contactId))) redirect("/retainers?error=" + encodeURIComponent("Contact not found"));
  const { data: c } = await db.from("contacts").select("email").eq("id", contactId).eq("workspace_id", ws.id).single();
  const row = { workspace_id: ws.id, contact_id: contactId, description: s(fd, "description") ?? "Monthly retainer", amount_gbp: Number(fd.get("amount")) || 0 };
  const { data: r, error } = await db.from("retainers").insert(row).select("id").single();
  if (error || !r) redirect("/retainers?error=" + encodeURIComponent(error?.message ?? "Could not create"));
  let note = "";
  try {
    const link = await (await import("@/lib/stripe")).createRetainerLink({ id: r.id, description: row.description, amount_gbp: row.amount_gbp, email: c?.email });
    if (link) await db.from("retainers").update({ checkout_url: link.url }).eq("id", r.id);
    else note = "Created without a card link: add STRIPE_SECRET_KEY in Vercel.";
  } catch (e) { note = "Stripe: " + String(e); }
  await logActivity(ws.id, "user", "created retainer", "retainer", r.id, `£${row.amount_gbp}/month`);
  redirect("/retainers" + (note ? `?error=${encodeURIComponent(note)}` : ""));
}
export async function sendRetainerLink(fd: FormData) {
  const { ws } = await requireStaff();
  const db = await supabaseServer();
  const { data: r } = await db.from("retainers").select("*").eq("id", String(fd.get("id"))).single();
  if (!r?.checkout_url) return;
  const { data: c } = await db.from("contacts").select("*").eq("id", r.contact_id).single();
  if (!c) return;
  const body = `Hi ${c.first_name || "there"},\n\nTo start your monthly plan (${r.description}, £${Number(r.amount_gbp).toFixed(2)} per month), please add your card using the secure button below. You will be charged each month automatically and can cancel any time by letting us know.\n\n[button: Set up monthly payment | ${r.checkout_url}]\n\nThank you,\n${ws.name}`;
  await sendEmail(ws, c, `Your monthly plan with ${ws.name}`, body);
  revalidatePath("/retainers");
}
export async function cancelRetainer(fd: FormData) {
  const { ws } = await requireStaff();
  await requireAdmin();
  const db = await supabaseServer();
  const { data: r } = await db.from("retainers").select("*").eq("id", String(fd.get("id"))).eq("workspace_id", ws.id).single();
  if (!r) return;
  if (r.stripe_subscription_id) await (await import("@/lib/stripe")).cancelStripeSubscription(r.stripe_subscription_id);
  await db.from("retainers").update({ status: "cancelled" }).eq("id", r.id);
  await logActivity(ws.id, "user", "cancelled retainer", "retainer", r.id);
  revalidatePath("/retainers");
}

// ───────── Integrations ─────────
export async function syncFacebookNow() {
  const { ws } = await requireStaff();
  const r = await (await import("@/lib/social")).syncSocialInbox(ws.id);
  await logActivity(ws.id, "user", "synced Facebook and Instagram inbox", "integration", undefined, `${r.imported} imported${r.error ? `, ${r.error}` : ""}`);
  redirect(`/integrations?synced=${r.imported}${r.error ? `&error=${encodeURIComponent(r.error)}` : ""}`);
}

// ───────── Proposals ─────────
export async function createProposal(fd: FormData) {
  const { ws } = await requireStaff();
  const db = await supabaseServer();
  if (!(await contactInWorkspace(db, ws.id, String(fd.get("contact_id"))))) redirect("/proposals?error=" + encodeURIComponent("Contact not found"));
  const { error } = await db.from("proposals").insert({ workspace_id: ws.id, contact_id: String(fd.get("contact_id")), title: s(fd, "title") ?? "Proposal", body: s(fd, "body") ?? "", amount_gbp: fd.get("amount") ? Number(fd.get("amount")) : null });
  redirect("/proposals" + (error ? `?error=${encodeURIComponent(error.message)}` : ""));
}
export async function sendProposal(fd: FormData) {
  const { ws } = await requireStaff();
  const db = await supabaseServer();
  const { data: p } = await db.from("proposals").select("*").eq("id", String(fd.get("id"))).eq("workspace_id", ws.id).single();
  if (!p) return;
  const { data: c } = await db.from("contacts").select("*").eq("id", p.contact_id).single();
  if (!c) return;
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/f/proposal/${p.token}`;
  const body = `Hi ${c.first_name || "there"},\n\nThank you for your time. I have put your proposal together: ${p.title}${p.amount_gbp != null ? ` (£${Number(p.amount_gbp).toLocaleString("en-GB")})` : ""}.\n\n[button: View and accept your proposal | ${url}]\n\nIf you have any questions, just reply to this email.\n\nBest wishes,\n${ws.name}`;
  const r = await sendEmail(ws, c, `Your proposal from ${ws.name}: ${p.title}`, body);
  if (r.ok) {
    if (p.status === "draft") await db.from("proposals").update({ status: "sent" }).eq("id", p.id);
    await logActivity(ws.id, "user", "sent proposal", "proposal", p.id, p.title);
  }
  revalidatePath("/proposals");
}
export async function deleteProposal(fd: FormData) {
  const { ws } = await requireStaff();
  await (await supabaseServer()).from("proposals").delete().eq("id", String(fd.get("id"))).eq("workspace_id", ws.id);
  revalidatePath("/proposals");
}

// ───────── Content calendar ─────────
export async function savePost(fd: FormData) {
  const { ws } = await requireStaff();
  const at = s(fd, "scheduled_at");
  if (!at) redirect("/calendar?error=Pick a date and time");
  await (await supabaseServer()).from("content_posts").insert({
    workspace_id: ws.id, client: s(fd, "client") ?? "Kydos Digital", platform: s(fd, "platform") ?? "facebook", caption: s(fd, "caption")!, media_url: s(fd, "media_url"),
    scheduled_at: new Date(new Date(at + "Z").getTime() - londonOffsetMs(at)).toISOString(), status: fd.get("for_approval") === "on" ? "awaiting_approval" : "draft",
  });
  revalidatePath("/calendar");
}
export async function setPostStatus(fd: FormData) {
  await requireStaff();
  await (await supabaseServer()).from("content_posts").update({ status: String(fd.get("status")) }).eq("id", String(fd.get("id")));
  revalidatePath("/calendar");
}
export async function deletePost(fd: FormData) {
  await requireStaff();
  await (await supabaseServer()).from("content_posts").delete().eq("id", String(fd.get("id")));
  revalidatePath("/calendar");
}
export async function createShare(fd: FormData) {
  const { ws } = await requireStaff();
  await (await supabaseServer()).from("calendar_shares").insert({ workspace_id: ws.id, client: s(fd, "client") ?? "Kydos Digital" });
  revalidatePath("/calendar");
}
export async function deleteShare(fd: FormData) {
  await requireStaff();
  await (await supabaseServer()).from("calendar_shares").delete().eq("token", String(fd.get("token")));
  revalidatePath("/calendar");
}


// ───────── Bulk contact actions ─────────
const ids = (fd: FormData) => fd.getAll("ids").map(String).filter(Boolean).slice(0, 500);

export async function bulkTag(fd: FormData) {
  const { ws } = await requireStaff();
  const db = await supabaseServer();
  const tag = s(fd, "tag");
  const list = ids(fd);
  if (!tag || !list.length) redirect("/contacts?error=" + encodeURIComponent("Select contacts and type a tag first"));
  const { data: rows } = await db.from("contacts").select("id,tags").eq("workspace_id", ws.id).in("id", list);
  let n = 0;
  for (const c of rows ?? []) {
    if ((c.tags ?? []).includes(tag!)) continue;
    await db.from("contacts").update({ tags: [...(c.tags ?? []), tag] }).eq("id", c.id);
    await fireTrigger(ws.id, c.id, { type: "tag_added", tag: tag! });
    n++;
  }
  await logActivity(ws.id, "user", `bulk tagged ${n} contacts "${tag}"`, "contact", list[0]);
  redirect(`/contacts?done=${encodeURIComponent(`Tagged ${n} contact${n === 1 ? "" : "s"} "${tag}"`)}`);
}

export async function bulkEnrol(fd: FormData) {
  const { ws } = await requireStaff();
  const list = ids(fd);
  const autoId = String(fd.get("automation_id") ?? "");
  if (!autoId || !list.length) redirect("/contacts?error=" + encodeURIComponent("Select contacts and an automation first"));
  const admin = supabaseAdmin();
  const { data: a } = await admin.from("automations").select("id").eq("id", autoId).eq("workspace_id", ws.id).maybeSingle();
  if (!a) redirect("/contacts?error=" + encodeURIComponent("Automation not found"));
  // Only enrol contacts that belong to this workspace (the admin client bypasses RLS).
  const { data: owned } = await admin.from("contacts").select("id").eq("workspace_id", ws.id).in("id", list);
  const ownedIds = (owned ?? []).map((c) => c.id);
  let n = 0;
  for (const cid of ownedIds) {
    const { data: active } = await admin.from("automation_runs").select("id").eq("automation_id", autoId).eq("contact_id", cid).eq("status", "active").maybeSingle();
    if (!active) { await admin.from("automation_runs").insert({ workspace_id: ws.id, automation_id: autoId, contact_id: cid }); n++; }
  }
  redirect(`/contacts?done=${encodeURIComponent(`Enrolled ${n} contact${n === 1 ? "" : "s"}`)}`);
}

export async function bulkDelete(fd: FormData) {
  const { ws } = await requireAdmin();
  const db = await supabaseServer();
  const list = ids(fd);
  if (!list.length) redirect("/contacts?error=" + encodeURIComponent("Select contacts first"));
  await db.from("contacts").delete().eq("workspace_id", ws.id).in("id", list);
  await logActivity(ws.id, "user", `bulk deleted ${list.length} contacts`, "contact");
  redirect(`/contacts?done=${encodeURIComponent(`Deleted ${list.length} contact${list.length === 1 ? "" : "s"}`)}`);
}

export async function setLostReason(fd: FormData) {
  const { ws } = await requireStaff();
  const db = await supabaseServer();
  await db.from("opportunities").update({ lost_reason: s(fd, "lost_reason") ?? null }).eq("id", String(fd.get("id"))).eq("workspace_id", ws.id);
  revalidatePath("/pipeline");
}

// ───────── WhatsApp templates ─────────
export async function submitWaTemplate(fd: FormData) {
  await requireAdmin();
  const { createWaTemplate } = await import("@/lib/whatsappTemplates");
  const name = String(fd.get("name") ?? "").toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  const body = String(fd.get("body") ?? "").trim();
  if (!name || !body) redirect("/whatsapp?error=" + encodeURIComponent("A name and message are required."));
  const vars = new Set(body.match(/\{\{\d+\}\}/g) ?? []).size;
  const examples = String(fd.get("examples") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (vars > examples.length) redirect("/whatsapp?error=" + encodeURIComponent(`Give ${vars} example value${vars === 1 ? "" : "s"}, comma separated. Meta needs them to review the template.`));
  const r = await createWaTemplate({ name, category: fd.get("category") === "MARKETING" ? "MARKETING" : "UTILITY", language: String(fd.get("language") || "en_GB"), body, footer: s(fd, "footer") ?? undefined, examples });
  if (!r.ok) redirect("/whatsapp?error=" + encodeURIComponent(r.error));
  revalidatePath("/whatsapp");
  redirect("/whatsapp?msg=" + encodeURIComponent("Submitted to Meta. Approval usually takes minutes to a day."));
}

export async function removeWaTemplate(fd: FormData) {
  await requireAdmin();
  const { deleteWaTemplate } = await import("@/lib/whatsappTemplates");
  const r = await deleteWaTemplate(String(fd.get("name")));
  if (!r.ok) redirect("/whatsapp?error=" + encodeURIComponent(r.error));
  revalidatePath("/whatsapp");
  redirect("/whatsapp?msg=" + encodeURIComponent("Template deleted."));
}

// ───────── Call tracking numbers ─────────
export async function addTrackingNumber(fd: FormData) {
  const { ws } = await requireAdmin();
  const { toE164 } = await import("@/lib/messaging");
  const number = toE164(String(fd.get("number") ?? ""));
  if (!number) redirect("/call-tracking?error=" + encodeURIComponent("Enter the number in full, e.g. +447..."));
  const { error } = await (await supabaseServer()).from("tracking_numbers").insert({ workspace_id: ws.id, number, label: s(fd, "label")!, utm_source: s(fd, "utm_source"), utm_medium: s(fd, "utm_medium"), utm_campaign: s(fd, "utm_campaign") });
  if (error) redirect("/call-tracking?error=" + encodeURIComponent(error.message.includes("duplicate") ? "That number is already added." : error.message));
  revalidatePath("/call-tracking");
}
export async function removeTrackingNumber(fd: FormData) {
  const { ws } = await requireAdmin();
  await (await supabaseServer()).from("tracking_numbers").delete().eq("id", String(fd.get("id"))).eq("workspace_id", ws.id);
  revalidatePath("/call-tracking");
}
