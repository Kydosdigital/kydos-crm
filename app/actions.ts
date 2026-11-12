"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { requireWorkspace, requireAdmin } from "@/lib/workspace";
import { sendEmail, sendSms, toE164, render } from "@/lib/messaging";
import { sendFromOutlook } from "@/lib/outlook";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fireTrigger } from "@/lib/automation";
import { sendMetaEvent } from "@/lib/capi";
import { logActivity } from "@/lib/log";

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
      brand_color: /^#[0-9a-fA-F]{6}$/.test(s(fd, "brand_color") ?? "") ? s(fd, "brand_color") : "#1f3a5f",
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
  const channel = String(fd.get("channel")) as "sms" | "email" | "whatsapp" | "outlook" | "messenger" | "instagram";
  const body = s(fd, "body");
  if (!body) return;
  const { data: c } = await db.from("contacts").select("*").eq("id", id).single();
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
  const { data: opp } = await db.from("opportunities").update({ stage_id: stageId, status, closed_at: status === "open" ? null : new Date().toISOString() }).eq("id", oppId).select("contact_id,value").single();
  if (opp) {
    await fireTrigger(ws.id, opp.contact_id, { type: "stage_changed", stage_id: stageId });
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
  const triggerType = String(fd.get("trigger_type"));
  const triggerValue = s(fd, "trigger_value");
  const config =
    triggerType === "tag_added" ? { tag: triggerValue } : triggerType === "form_submitted" ? { form: triggerValue } : triggerType === "date_reached" ? (() => { const [field, off, yr] = (triggerValue ?? "").split(",").map((x) => x.trim()); return { field, offset_days: off || "0", yearly: yr === "yearly" ? "1" : "0" }; })() : {};
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
    else if (t === "skip_if" || t === "skip_unless") {
      const [cond, n] = arg.split("|").map((x) => x.trim());
      config = { cond, n: Number(n) || 1 };
    } else if (t === "wait_until") {
      const [cond, hours] = arg.split("|").map((x) => x.trim());
      config = { cond, hours: Number(hours) || 24 };
    } else if (t === "wait_before") {
      const [hours, skip] = arg.split("|").map((x) => x.trim());
      config = { hours: Number(hours) || 24, skip: Number(skip) || 0 };
    } else if (t === "wait_after") config = { hours: Number(arg) || 1 };
    else if (t === "webhook") config = { url: arg };
    return { automation_id: a.id, workspace_id: ws.id, position, type: t, config };
  });
  if (steps.length) await db.from("automation_steps").insert(steps);
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
  const { ws } = await requireAdmin();
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
  const listId = s(fd, "list");
  const subject = s(fd, "subject");
  const body = s(fd, "body");
  if ((!tag && !listId) || !subject || !body) redirect("/broadcast?error=Audience, subject and message are all required");
  const sendAt = s(fd, "send_at");
  if (sendAt && fd.get("confirm") === "on") {
    const when = new Date(new Date(sendAt + "Z").getTime() - londonOffsetMs(sendAt));
    await db.from("scheduled_sends").insert({ workspace_id: ws.id, tag: listId ? null : tag, list_id: listId || null, subject, body, send_at: when.toISOString() });
    redirect(`/broadcast?scheduled=1`);
  }
  if (fd.get("confirm") !== "on") redirect(`/broadcast?${listId ? `list=${listId}` : `tag=${encodeURIComponent(tag!)}`}&error=Tick the consent confirmation first`);
  let list: Awaited<ReturnType<typeof import("@/lib/lists").matchList>> | null;
  if (listId) {
    const { data: l } = await db.from("smart_lists").select("*").eq("id", listId).eq("workspace_id", ws.id).single();
    list = l ? (await (await import("@/lib/lists")).matchList(ws.id, l.filter)).filter((c) => c.email && !c.email_opt_out).slice(0, 90) : [];
  } else {
    const r = await db.from("contacts").select("*").eq("workspace_id", ws.id).contains("tags", [tag!]).eq("email_opt_out", false).not("email", "is", null).limit(90);
    list = r.data as typeof list;
  }
  let sent = 0;
  for (const c of list ?? []) {
    const r = await sendEmail(ws, c, render(subject!, c), render(body!, c));
    if (r.ok) sent++;
  }
  redirect(`/broadcast?done=${sent}`);
}

/** Offset of Europe/London from UTC at a given local datetime-local string (handles BST). */
function londonOffsetMs(local: string) {
  const asUtc = new Date(local + "Z");
  const london = new Date(asUtc.toLocaleString("en-US", { timeZone: "Europe/London" }));
  const utc = new Date(asUtc.toLocaleString("en-US", { timeZone: "UTC" }));
  return london.getTime() - utc.getTime();
}
export async function cancelScheduled(fd: FormData) {
  await requireWorkspace();
  await (await supabaseServer()).from("scheduled_sends").update({ status: "cancelled" }).eq("id", String(fd.get("id"))).eq("status", "scheduled");
  revalidatePath("/broadcast");
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

// ───────── Knowledge base and agent ─────────
import { sendDraft, draftFor, agentAvailable } from "@/lib/agent";
import { loadEngagement, analyse } from "@/lib/engagement";

export async function saveKnowledge(fd: FormData) {
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const id = s(fd, "id");
  const row = { workspace_id: ws.id, kind: String(fd.get("kind")), title: s(fd, "title") ?? "Untitled", body: s(fd, "body") ?? "" };
  if (id) await db.from("knowledge_items").update(row).eq("id", id);
  else await db.from("knowledge_items").insert(row);
  revalidatePath("/knowledge");
}
export async function deleteKnowledge(fd: FormData) {
  await requireWorkspace();
  await (await supabaseServer()).from("knowledge_items").delete().eq("id", String(fd.get("id")));
  revalidatePath("/knowledge");
}
export async function toggleKnowledge(fd: FormData) {
  await requireWorkspace();
  await (await supabaseServer()).from("knowledge_items").update({ active: fd.get("active") === "true" }).eq("id", String(fd.get("id")));
  revalidatePath("/knowledge");
}

export async function createDraft(fd: FormData) {
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const body = s(fd, "body");
  if (!body) return;
  await db.from("agent_drafts").insert({
    workspace_id: ws.id, contact_id: String(fd.get("contact_id")), channel: String(fd.get("channel")), subject: s(fd, "subject"), body,
    state: s(fd, "state"), tactic: s(fd, "tactic"), source: "manual", status: "pending",
  });
  revalidatePath("/agent");
}
export async function editDraft(fd: FormData) {
  await requireWorkspace();
  await (await supabaseServer()).from("agent_drafts").update({ subject: s(fd, "subject"), body: s(fd, "body") ?? "" }).eq("id", String(fd.get("id"))).eq("status", "pending");
  revalidatePath("/agent");
}
export async function approveDraft(fd: FormData) {
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const id = String(fd.get("id"));
  const { data: d } = await db.from("agent_drafts").select("id").eq("id", id).maybeSingle(); // RLS check: draft belongs to this workspace
  if (!d) return;
  await sendDraft(ws as never, id);
  revalidatePath("/agent");
}
export async function rejectDraft(fd: FormData) {
  await requireWorkspace();
  await (await supabaseServer()).from("agent_drafts").update({ status: "rejected", decided_at: new Date().toISOString() }).eq("id", String(fd.get("id")));
  revalidatePath("/agent");
}
export async function setAgentMode(fd: FormData) {
  const { ws } = await requireWorkspace();
  await (await supabaseServer()).from("workspaces").update({ agent_mode: String(fd.get("mode")) }).eq("id", ws.id);
  revalidatePath("/agent");
}
export async function askAgentToDraft(fd: FormData) {
  const { ws } = await requireWorkspace();
  if (!agentAvailable()) return;
  const { msgs, events, contacts } = await loadEngagement(ws.id, 60);
  const row = analyse(msgs, events, contacts).rows.find((r) => r.contact.id === String(fd.get("contact_id")));
  if (row) await draftFor(ws as never, row.contact.id, row.state);
  revalidatePath("/agent");
}


// ───────── Custom fields, smart lists, bookings ─────────
export async function saveField(fd: FormData) {
  const { ws } = await requireWorkspace();
  const label = s(fd, "label");
  if (!label) return;
  const key = (s(fd, "key") ?? label).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const options = (s(fd, "options") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  await (await supabaseServer()).from("custom_fields").upsert({ workspace_id: ws.id, key, label, type: String(fd.get("type") ?? "text"), options }, { onConflict: "workspace_id,key" });
  revalidatePath("/lists");
}
export async function deleteField(fd: FormData) {
  await requireWorkspace();
  await (await supabaseServer()).from("custom_fields").delete().eq("id", String(fd.get("id")));
  revalidatePath("/lists");
}
export async function saveCustomValues(fd: FormData) {
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const id = String(fd.get("contact_id"));
  const { data: fields } = await db.from("custom_fields").select("key").eq("workspace_id", ws.id);
  const custom: Record<string, string> = {};
  for (const f of fields ?? []) { const v = s(fd, `cf_${f.key}`); if (v) custom[f.key] = v; }
  await db.from("contacts").update({ custom }).eq("id", id).eq("workspace_id", ws.id);
  revalidatePath(`/contacts/${id}`);
}
export async function saveList(fd: FormData) {
  const { ws } = await requireWorkspace();
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
  await requireWorkspace();
  await (await supabaseServer()).from("smart_lists").delete().eq("id", String(fd.get("id")));
  revalidatePath("/lists");
}
export async function enrolList(fd: FormData) {
  const { ws } = await requireWorkspace();
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
  const { ws } = await requireWorkspace();
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
  await requireWorkspace();
  await (await supabaseServer()).from("hosted_forms").update({ active: fd.get("active") === "1" }).eq("id", String(fd.get("id")));
  revalidatePath("/forms");
}
export async function deleteForm(fd: FormData) {
  await requireWorkspace();
  await (await supabaseServer()).from("hosted_forms").delete().eq("id", String(fd.get("id")));
  revalidatePath("/forms");
}

// ───────── Calls ─────────
export async function callContact(fd: FormData) {
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const id = String(fd.get("contact_id"));
  const { data: c } = await db.from("contacts").select("id,phone").eq("id", id).single();
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
  const role = fd.get("role") === "admin" ? "admin" : "member";
  if (!email) redirect("/team?error=Enter an email");
  const admin = supabaseAdmin();
  let userId: string | undefined;
  const invited = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/login` });
  userId = invited.data.user?.id;
  if (!userId) {
    const list = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    userId = list.data.users.find((u) => u.email?.toLowerCase() === email)?.id;
  }
  if (!userId) redirect("/team?error=" + encodeURIComponent(invited.error?.message ?? "Could not invite that email"));
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
  const { ws } = await requireWorkspace();
  const id = String(fd.get("contact_id"));
  await (await supabaseServer()).from("contacts").update({ owner_id: String(fd.get("owner_id")) || null }).eq("id", id).eq("workspace_id", ws.id);
  revalidatePath(`/contacts/${id}`);
}

// ───────── Snippets ─────────
export async function saveSnippet(fd: FormData) {
  const { ws } = await requireWorkspace();
  await (await supabaseServer()).from("snippets").insert({ workspace_id: ws.id, name: s(fd, "name")!, body: s(fd, "body")! });
  revalidatePath("/snippets");
}
export async function deleteSnippet(fd: FormData) {
  await requireWorkspace();
  await (await supabaseServer()).from("snippets").delete().eq("id", String(fd.get("id")));
  revalidatePath("/snippets");
}

// ───────── Task board ─────────
export async function assignTask(fd: FormData) {
  const { ws } = await requireWorkspace();
  await (await supabaseServer()).from("tasks").update({ assigned_to: String(fd.get("user_id")) || null }).eq("id", String(fd.get("id"))).eq("workspace_id", ws.id);
  revalidatePath("/tasks");
}
export async function toggleTaskBoard(fd: FormData) {
  const { ws } = await requireWorkspace();
  await (await supabaseServer()).from("tasks").update({ done: fd.get("done") === "true" }).eq("id", String(fd.get("id"))).eq("workspace_id", ws.id);
  revalidatePath("/tasks");
}

// ───────── Invoices ─────────
export async function createInvoice(fd: FormData) {
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const contactId = String(fd.get("contact_id"));
  const kind = fd.get("kind") === "estimate" ? "estimate" : "invoice";
  const { count } = await db.from("invoices").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id);
  const number = `${kind === "estimate" ? "EST" : "INV"}-${String((count ?? 0) + 1).padStart(4, "0")}`;
  const { data: c } = await db.from("contacts").select("email").eq("id", contactId).single();
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
  const { ws } = await requireWorkspace();
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
  await requireWorkspace();
  const status = String(fd.get("status"));
  await (await supabaseServer()).from("invoices").update({ status, ...(status === "paid" ? { paid_at: new Date().toISOString() } : {}) }).eq("id", String(fd.get("id")));
  revalidatePath("/invoices");
}

// ───────── Content calendar ─────────
export async function savePost(fd: FormData) {
  const { ws } = await requireWorkspace();
  const at = s(fd, "scheduled_at");
  if (!at) redirect("/calendar?error=Pick a date and time");
  await (await supabaseServer()).from("content_posts").insert({
    workspace_id: ws.id, client: s(fd, "client") ?? "Kydos Digital", platform: s(fd, "platform") ?? "facebook", caption: s(fd, "caption")!, media_url: s(fd, "media_url"),
    scheduled_at: new Date(new Date(at + "Z").getTime() - londonOffsetMs(at)).toISOString(), status: fd.get("for_approval") === "on" ? "awaiting_approval" : "draft",
  });
  revalidatePath("/calendar");
}
export async function setPostStatus(fd: FormData) {
  await requireWorkspace();
  await (await supabaseServer()).from("content_posts").update({ status: String(fd.get("status")) }).eq("id", String(fd.get("id")));
  revalidatePath("/calendar");
}
export async function deletePost(fd: FormData) {
  await requireWorkspace();
  await (await supabaseServer()).from("content_posts").delete().eq("id", String(fd.get("id")));
  revalidatePath("/calendar");
}
export async function createShare(fd: FormData) {
  const { ws } = await requireWorkspace();
  await (await supabaseServer()).from("calendar_shares").insert({ workspace_id: ws.id, client: s(fd, "client") ?? "Kydos Digital" });
  revalidatePath("/calendar");
}
export async function deleteShare(fd: FormData) {
  await requireWorkspace();
  await (await supabaseServer()).from("calendar_shares").delete().eq("token", String(fd.get("token")));
  revalidatePath("/calendar");
}
