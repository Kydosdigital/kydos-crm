import { requireWorkspace } from "@/lib/workspace";
import { brandEmail } from "@/lib/emailBrand";

// Signed-in preview of the branded email layout, shown in Settings.
export async function GET() {
  const { ws } = await requireWorkspace();
  const sample = `Hi Sam,\n\nThanks for getting in touch. Here is what happens next:\n\n- We review your website and ads this week\n- You get a short, honest report\n- We talk it through on a 20 minute call\n\n[button: Book your free call | ${ws.booking_link ?? "https://cal.com"}]\n\nSpeak soon.`;
  return new Response(brandEmail(ws, sample, { unsubscribeUrl: "#", preheader: "Here is what happens next" }), { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
