import { supabaseAdmin } from "./supabase/admin";

export type Status = "connected" | "needs_setup" | "error";
export type Integration = {
  key: string; name: string; what: string; envs: string[]; setup: string;
  check?: () => Promise<{ ok: boolean; detail: string }>;
  activity?: (wsId: string) => Promise<string | null>; // latest activity timestamp
  syncable?: boolean;
};
const env = (k: string) => process.env[k];
const GRAPH = "https://graph.facebook.com/v23.0";
async function j(url: string, init?: RequestInit) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(6000) });
  return { ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) as Record<string, unknown> };
}
const lastMsg = (channel: string) => async (ws: string) => (await supabaseAdmin().from("messages").select("created_at").eq("workspace_id", ws).eq("channel", channel).order("created_at", { ascending: false }).limit(1).maybeSingle()).data?.created_at ?? null;
const lastAct = (actor: string) => async (ws: string) => (await supabaseAdmin().from("activity_log").select("created_at").eq("workspace_id", ws).eq("actor", actor).order("created_at", { ascending: false }).limit(1).maybeSingle()).data?.created_at ?? null;
const lastSource = (src: string) => async (ws: string) => (await supabaseAdmin().from("contacts").select("created_at").eq("workspace_id", ws).eq("source", src).order("created_at", { ascending: false }).limit(1).maybeSingle()).data?.created_at ?? null;

/** Add a new integration by adding one entry here: it then appears on the Integrations page with status, last activity and a health check. */
export const INTEGRATIONS: Integration[] = [
  { key: "email", name: "Email (Resend)", what: "Sending, delivery, opens, clicks and bounces", envs: ["RESEND_API_KEY", "RESEND_WEBHOOK_SECRET"], setup: "Verify your domain in Resend and add the webhook to /api/webhooks/resend.",
    check: async () => { const r = await j("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}` } }); const d = (r.body.data as { name: string; status: string }[] | undefined) ?? []; return { ok: r.ok, detail: r.ok ? d.map((x) => `${x.name}: ${x.status}`).join(", ") || "No domains" : `Resend ${r.status}` }; }, activity: lastMsg("email") },
  { key: "facebook", name: "Facebook and Instagram", what: "Lead ads, Messenger and Instagram DMs, Conversions API", envs: ["META_PAGE_TOKEN", "META_APP_SECRET", "META_VERIFY_TOKEN"], setup: "Add the Page token and app secret in Vercel, then point the Meta webhook at /api/webhooks/meta.",
    check: async () => { const r = await j(`${GRAPH}/me?fields=name,id&access_token=${env("META_PAGE_TOKEN")}`); return { ok: r.ok, detail: r.ok ? `Page: ${r.body.name}` : String((r.body.error as { message?: string })?.message ?? `Meta ${r.status}`) }; },
    activity: async (ws) => { const a = await lastMsg("messenger")(ws), b = await lastMsg("instagram")(ws), c = await lastSource("facebook-lead-ad")(ws); return [a, b, c].filter(Boolean).sort().pop() ?? null; }, syncable: true },
  { key: "whatsapp", name: "WhatsApp Business", what: "Template and 24-hour window messaging, inbound replies", envs: ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_WABA_ID"], setup: "Add the permanent token and phone number ID in Vercel.",
    check: async () => { const r = await j(`${GRAPH}/${env("WHATSAPP_PHONE_NUMBER_ID")}?fields=display_phone_number,verified_name,quality_rating&access_token=${env("WHATSAPP_TOKEN")}`); return { ok: r.ok, detail: r.ok ? `${r.body.verified_name} ${r.body.display_phone_number} (quality ${r.body.quality_rating ?? "n/a"})` : String((r.body.error as { message?: string })?.message ?? `Meta ${r.status}`) }; }, activity: lastMsg("whatsapp") },
  { key: "twilio", name: "Twilio (SMS and calls)", what: "Text messages, click-to-call, call forwarding, missed-call alerts", envs: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"], setup: "Add the Twilio SID and auth token, then set the number's voice webhook to /api/webhooks/twilio-voice.",
    check: async () => { const r = await j(`https://api.twilio.com/2010-04-01/Accounts/${env("TWILIO_ACCOUNT_SID")}.json`, { headers: { Authorization: "Basic " + Buffer.from(`${env("TWILIO_ACCOUNT_SID")}:${env("TWILIO_AUTH_TOKEN")}`).toString("base64") } }); return { ok: r.ok, detail: r.ok ? `Account ${r.body.friendly_name} (${r.body.status})` : `Twilio ${r.status}` }; },
    activity: async (ws) => { const a = await lastMsg("sms")(ws); const c = (await supabaseAdmin().from("call_logs").select("created_at").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(1).maybeSingle()).data?.created_at ?? null; return [a, c].filter(Boolean).sort().pop() ?? null; } },
  { key: "stripe", name: "Stripe", what: "Invoice payment links, monthly retainers, payment webhooks", envs: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"], setup: "Add the secret key and webhook signing secret, and register /api/webhooks/stripe.",
    check: async () => { const r = await j("https://api.stripe.com/v1/balance", { headers: { Authorization: `Bearer ${env("STRIPE_SECRET_KEY")}` } }); return { ok: r.ok, detail: r.ok ? `Live mode: ${String(r.body.livemode)}` : `Stripe ${r.status}` }; }, activity: lastAct("stripe") },
  { key: "calcom", name: "Cal.com bookings", what: "Bookings, cancellations and reminders", envs: ["CALCOM_WEBHOOK_SECRET"], setup: "Add a Cal.com webhook to /api/webhooks/calcom using the shared secret.", activity: lastSource("calcom") },
  { key: "outlook", name: "Outlook mailbox", what: "Two-way one-to-one email sync", envs: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"], setup: "Connect your mailbox in Settings." },
  { key: "ai", name: "AI assistant", what: "Drafted replies, analysis and the experiment agent", envs: ["ANTHROPIC_API_KEY"], setup: "Add ANTHROPIC_API_KEY when you are ready to switch AI features on." },
  { key: "mcp", name: "Claude connector (MCP)", what: "Let Claude read and act on the CRM", envs: ["MCP_API_KEY"], setup: "Already configured when the key is present." },
];

export async function inspect(wsId: string) {
  return Promise.all(INTEGRATIONS.map(async (i) => {
    const missing = i.envs.filter((e) => !env(e));
    const hasKeys = missing.length === 0;
    let status: Status = hasKeys ? "connected" : "needs_setup";
    let detail = hasKeys ? "Keys present" : `Missing: ${missing.join(", ")}`;
    if (hasKeys && i.check) {
      try { const r = await i.check(); status = r.ok ? "connected" : "error"; detail = r.detail; } catch (e) { status = "error"; detail = String(e).slice(0, 120); }
    }
    let last: string | null = null;
    try { last = i.activity ? await i.activity(wsId) : null; } catch { /* optional */ }
    return { key: i.key, name: i.name, what: i.what, setup: i.setup, status, detail, last, syncable: !!i.syncable && hasKeys };
  }));
}
