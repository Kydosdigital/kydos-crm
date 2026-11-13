import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { render, sendEmail, toE164 } from "@/lib/messaging";
import { sendFromOutlook } from "@/lib/outlook";
import { fireTrigger } from "@/lib/automation";
import { buildReport } from "@/lib/report";
import { analyse, loadEngagement, PLAYBOOK, STATE_LABEL } from "@/lib/engagement";
import { sendDraft } from "@/lib/agent";

// MCP endpoint for chatting with the CRM from Claude. Auth: ?key=<MCP_API_KEY> or "Authorization: Bearer <MCP_API_KEY>".
// The key unlocks the workspace whose slug is MCP_WORKSPACE_SLUG (default kydos-digital).
export const maxDuration = 60;

const text = (o: unknown) => ({ content: [{ type: "text" as const, text: typeof o === "string" ? o : JSON.stringify(o, null, 2) }] });

async function workspace() {
  const { data } = await supabaseAdmin().from("workspaces").select("*").eq("slug", process.env.MCP_WORKSPACE_SLUG ?? "kydos-digital").single();
  return data!;
}

function buildServer() {
  const db = supabaseAdmin();
  const server = new McpServer({ name: "kydos-crm", version: "1.0.0" });

  server.registerTool("search_contacts", {
    description: "Search contacts by name, email, phone, company or tag.",
    inputSchema: { query: z.string().optional(), tag: z.string().optional(), limit: z.number().optional() },
  }, async ({ query, tag, limit }) => {
    const ws = await workspace();
    let q = db.from("contacts").select("id,first_name,last_name,email,phone,company,tags,email_opt_out,created_at").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(limit ?? 20);
    if (query) q = q.or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%,phone.ilike.%${query}%,company.ilike.%${query}%`);
    if (tag) q = q.contains("tags", [tag]);
    return text((await q).data ?? []);
  });

  server.registerTool("get_contact", {
    description: "Get one contact with recent messages, notes, tasks and opportunities.",
    inputSchema: { contact_id: z.string() },
  }, async ({ contact_id }) => {
    const ws = await workspace();
    const cRes = await db.from("contacts").select("*").eq("id", contact_id).eq("workspace_id", ws.id).maybeSingle();
    // Refuse related records unless the contact itself belongs to this workspace.
    if (!cRes.data) return text({ contact: null, messages: [], notes: [], tasks: [], opportunities: [] });
    const [c, m, n, t, o] = await Promise.all([
      Promise.resolve(cRes),
      db.from("messages").select("channel,direction,subject,body,status,created_at").eq("contact_id", contact_id).order("created_at", { ascending: false }).limit(15),
      db.from("notes").select("body,created_at").eq("contact_id", contact_id).order("created_at", { ascending: false }).limit(10),
      db.from("tasks").select("id,title,due_at,done").eq("contact_id", contact_id),
      db.from("opportunities").select("id,title,value,status,stage_id").eq("contact_id", contact_id),
    ]);
    return text({ contact: c.data, messages: m.data, notes: n.data, tasks: t.data, opportunities: o.data });
  });

  server.registerTool("create_contact", {
    description: "Create a contact (starts 'contact created' and tag automations). Include a consent note for marketing.",
    inputSchema: { first_name: z.string().optional(), last_name: z.string().optional(), email: z.string().optional(), phone: z.string().optional(), company: z.string().optional(), tags: z.array(z.string()).optional(), consent_note: z.string().optional() },
  }, async (a) => {
    const ws = await workspace();
    const { data, error } = await db.from("contacts").insert({ workspace_id: ws.id, ...a, phone: toE164(a.phone), tags: a.tags ?? [], source: "mcp" }).select("id").single();
    if (error || !data) return text(`Failed: ${error?.message}`);
    await fireTrigger(ws.id, data.id, { type: "contact_created" });
    for (const tag of a.tags ?? []) await fireTrigger(ws.id, data.id, { type: "tag_added", tag });
    return text({ id: data.id });
  });

  server.registerTool("add_tag", { description: "Add a tag to a contact (fires tag automations).", inputSchema: { contact_id: z.string(), tag: z.string() } }, async ({ contact_id, tag }) => {
    const ws = await workspace();
    const { data: c } = await db.from("contacts").select("tags").eq("id", contact_id).eq("workspace_id", ws.id).single();
    if (!c) return text("Contact not found");
    if (!c.tags.includes(tag)) {
      await db.from("contacts").update({ tags: [...c.tags, tag] }).eq("id", contact_id);
      await fireTrigger(ws.id, contact_id, { type: "tag_added", tag });
    }
    return text("Done");
  });

  server.registerTool("add_note", { description: "Add a note to a contact.", inputSchema: { contact_id: z.string(), body: z.string() } }, async ({ contact_id, body }) => {
    const ws = await workspace();
    await db.from("notes").insert({ workspace_id: ws.id, contact_id, body });
    return text("Saved");
  });

  server.registerTool("create_task", { description: "Create a task on a contact, optional ISO due date.", inputSchema: { contact_id: z.string(), title: z.string(), due_at: z.string().optional() } }, async ({ contact_id, title, due_at }) => {
    const ws = await workspace();
    await db.from("tasks").insert({ workspace_id: ws.id, contact_id, title, due_at: due_at ? new Date(due_at).toISOString() : null });
    return text("Created");
  });

  server.registerTool("list_pipeline", { description: "List stages and open opportunities.", inputSchema: {} }, async () => {
    const ws = await workspace();
    const [s, o] = await Promise.all([
      db.from("stages").select("id,name,position").eq("workspace_id", ws.id).order("position"),
      db.from("opportunities").select("id,title,value,status,stage_id,contact_id").eq("workspace_id", ws.id).eq("status", "open"),
    ]);
    return text({ stages: s.data, opportunities: o.data });
  });

  server.registerTool("move_opportunity", { description: "Move an opportunity to a stage by stage id (won/lost stages update status).", inputSchema: { opportunity_id: z.string(), stage_id: z.string() } }, async ({ opportunity_id, stage_id }) => {
    const ws = await workspace();
    const { data: stage } = await db.from("stages").select("name").eq("id", stage_id).eq("workspace_id", ws.id).single();
    if (!stage) return text("Stage not found");
    const status = stage.name === "Won" ? "won" : stage.name === "Lost" ? "lost" : "open";
    const { data: opp } = await db.from("opportunities").update({ stage_id, status }).eq("id", opportunity_id).eq("workspace_id", ws.id).select("contact_id").single();
    if (opp) await fireTrigger(ws.id, opp.contact_id, { type: "stage_changed", stage_id });
    return text(opp ? "Moved" : "Opportunity not found");
  });

  server.registerTool("send_email", {
    description: "Send a one-to-one email to a contact. Use outlook=true to send from the connected Outlook mailbox, otherwise Resend. Always confirm the wording with the user first.",
    inputSchema: { contact_id: z.string(), subject: z.string(), body: z.string(), outlook: z.boolean().optional() },
  }, async ({ contact_id, subject, body, outlook }) => {
    const ws = await workspace();
    const { data: c } = await db.from("contacts").select("*").eq("id", contact_id).eq("workspace_id", ws.id).single();
    if (!c) return text("Contact not found");
    const r = outlook ? await sendFromOutlook(ws, c, subject, body) : await sendEmail(ws, c, render(subject, c), render(body, c));
    return text(r);
  });

  server.registerTool("recent_messages", { description: "Latest inbound and outbound messages across all contacts.", inputSchema: { limit: z.number().optional(), direction: z.enum(["in", "out"]).optional() } }, async ({ limit, direction }) => {
    const ws = await workspace();
    let q = db.from("messages").select("contact_id,channel,direction,subject,body,status,created_at").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(limit ?? 20);
    if (direction) q = q.eq("direction", direction);
    return text((await q).data ?? []);
  });

  server.registerTool("engagement_report", { description: "Communications report: email and WhatsApp funnel (sent, delivered, opened, clicked, replied), contact states, hot leads, best subject lines.", inputSchema: { days: z.number().optional() } }, async ({ days }) => {
    const ws = await workspace();
    return text(await buildReport(ws.id, days ?? 7));
  });

  server.registerTool("hot_leads", { description: "Contacts ranked by engagement score with their state (opened no click, clicked not booked, replied awaiting us, etc.) and the suggested next move.", inputSchema: { limit: z.number().optional() } }, async ({ limit }) => {
    const ws = await workspace();
    const { msgs, events, contacts } = await loadEngagement(ws.id, 60);
    const rows = analyse(msgs, events, contacts).rows.filter((r) => r.score > 0 || r.state === "reply_waiting").sort((a, b) => b.score - a.score).slice(0, limit ?? 15);
    return text(rows.map((r) => ({ id: r.contact.id, name: [r.contact.first_name, r.contact.last_name].filter(Boolean).join(" "), email: r.contact.email, state: STATE_LABEL[r.state], score: r.score, sent: r.sent, opens: r.opens, clicks: r.clicks, replies: r.replies, why: PLAYBOOK[r.state].why, next: PLAYBOOK[r.state].do })));
  });

  server.registerTool("knowledge_base", { description: "List the agent knowledge base, or add/update an item (kind: service, offer_ladder, case_study, objection, faq, tone, rule).", inputSchema: { add_kind: z.string().optional(), add_title: z.string().optional(), add_body: z.string().optional() } }, async ({ add_kind, add_title, add_body }) => {
    const ws = await workspace();
    if (add_kind && add_title && add_body) {
      const { error } = await db.from("knowledge_items").insert({ workspace_id: ws.id, kind: add_kind, title: add_title, body: add_body });
      return text(error ? error.message : "Added");
    }
    return text((await db.from("knowledge_items").select("id,kind,title,body,active").eq("workspace_id", ws.id).order("kind")).data ?? []);
  });

  server.registerTool("agent_drafts", { description: "List pending drafts in the approval queue, or create one (contact_id, channel, body, subject), or approve and send / reject one by id.", inputSchema: { contact_id: z.string().optional(), channel: z.string().optional(), subject: z.string().optional(), body: z.string().optional(), approve_id: z.string().optional(), reject_id: z.string().optional() } }, async ({ contact_id, channel, subject, body, approve_id, reject_id }) => {
    const ws = await workspace();
    if (approve_id) return text(await sendDraft(ws, approve_id));
    if (reject_id) { await db.from("agent_drafts").update({ status: "rejected", decided_at: new Date().toISOString() }).eq("id", reject_id).eq("workspace_id", ws.id); return text("Rejected"); }
    if (contact_id && channel && body) { await db.from("agent_drafts").insert({ workspace_id: ws.id, contact_id, channel, subject, body, source: "manual" }); return text("Draft added to queue"); }
    return text((await db.from("agent_drafts").select("id,contact_id,channel,subject,body,state,hypothesis,source,status,created_at").eq("workspace_id", ws.id).eq("status", "pending").order("created_at", { ascending: false })).data ?? []);
  });

  server.registerTool("list_automations", { description: "List automations with run counts, and enrol a contact if enrol_contact_id is given.", inputSchema: { enrol_contact_id: z.string().optional(), automation_id: z.string().optional() } }, async ({ enrol_contact_id, automation_id }) => {
    const ws = await workspace();
    if (enrol_contact_id && automation_id) {
      await db.from("automation_runs").insert({ workspace_id: ws.id, automation_id, contact_id: enrol_contact_id });
      return text("Enrolled");
    }
    const [a, r] = await Promise.all([
      db.from("automations").select("id,name,trigger_type,trigger_config,active").eq("workspace_id", ws.id),
      db.from("automation_runs").select("automation_id,status").eq("workspace_id", ws.id),
    ]);
    return text((a.data ?? []).map((x) => ({ ...x, runs: (r.data ?? []).filter((y) => y.automation_id === x.id).reduce((m: Record<string, number>, y) => ({ ...m, [y.status]: (m[y.status] ?? 0) + 1 }), {}) })));
  });

  return server;
}

function authorised(req: Request) {
  const key = process.env.MCP_API_KEY;
  if (!key) return false;
  const given = new URL(req.url).searchParams.get("key") ?? (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given), b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: Request) {
  if (!authorised(req)) return new Response("Unauthorized", { status: 401 });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await buildServer().connect(transport);
  return transport.handleRequest(req);
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
