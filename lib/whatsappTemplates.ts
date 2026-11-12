// Manage WhatsApp message templates on the WhatsApp Business Account through the Meta Graph API.
const GRAPH = "https://graph.facebook.com/v23.0";

export type WaTemplate = { id: string; name: string; status: string; category: string; language: string; body: string; footer: string | null; reason: string | null };

export function waConfigured() {
  return !!process.env.WHATSAPP_TOKEN && !!process.env.WHATSAPP_WABA_ID;
}

export async function listWaTemplates(): Promise<{ ok: true; items: WaTemplate[] } | { ok: false; error: string }> {
  if (!waConfigured()) return { ok: false, error: "Add WHATSAPP_TOKEN and WHATSAPP_WABA_ID (your WhatsApp Business Account ID) in Vercel to manage templates here." };
  const r = await fetch(`${GRAPH}/${process.env.WHATSAPP_WABA_ID}/message_templates?limit=100&fields=id,name,status,category,language,components,rejected_reason&access_token=${process.env.WHATSAPP_TOKEN}`, { cache: "no-store" });
  const j = await r.json();
  if (!r.ok) return { ok: false, error: j?.error?.message ?? `Meta ${r.status}` };
  const items = (j.data ?? []).map((t: { id: string; name: string; status: string; category: string; language: string; rejected_reason?: string; components?: { type: string; text?: string }[] }) => ({
    id: t.id, name: t.name, status: t.status, category: t.category, language: t.language,
    body: t.components?.find((c) => c.type === "BODY")?.text ?? "",
    footer: t.components?.find((c) => c.type === "FOOTER")?.text ?? null,
    reason: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : null,
  }));
  return { ok: true, items };
}

export async function createWaTemplate(input: { name: string; category: "UTILITY" | "MARKETING"; language: string; body: string; footer?: string; examples: string[] }) {
  if (!waConfigured()) return { ok: false as const, error: "WhatsApp is not configured." };
  const vars = new Set(input.body.match(/\{\{\d+\}\}/g) ?? []).size;
  const components: Record<string, unknown>[] = [{ type: "BODY", text: input.body, ...(vars ? { example: { body_text: [input.examples.slice(0, vars)] } } : {}) }];
  if (input.footer) components.push({ type: "FOOTER", text: input.footer });
  const r = await fetch(`${GRAPH}/${process.env.WHATSAPP_WABA_ID}/message_templates`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: input.name, category: input.category, language: input.language, components }),
  });
  const j = await r.json();
  if (!r.ok) return { ok: false as const, error: j?.error?.error_user_msg ?? j?.error?.message ?? `Meta ${r.status}` };
  return { ok: true as const };
}

export async function deleteWaTemplate(name: string) {
  if (!waConfigured()) return { ok: false as const, error: "WhatsApp is not configured." };
  const r = await fetch(`${GRAPH}/${process.env.WHATSAPP_WABA_ID}/message_templates?name=${encodeURIComponent(name)}`, { method: "DELETE", headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } });
  const j = await r.json();
  if (!r.ok) return { ok: false as const, error: j?.error?.message ?? `Meta ${r.status}` };
  return { ok: true as const };
}
