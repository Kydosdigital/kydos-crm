import { Resend } from "resend";
import { supabaseAdmin } from "./supabase/admin";

/** Sends an internal alert email to the workspace's notify address (Settings). Silent no-op if not configured. */
export async function notifyOwner(workspaceId: string, subject: string, body: string) {
  const { data: ws } = await supabaseAdmin().from("workspaces").select("name,email_from,notify_email").eq("id", workspaceId).single();
  if (!ws?.notify_email || !ws.email_from) return false;
  try {
    await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: ws.email_from,
      to: ws.notify_email,
      subject: `[${ws.name}] ${subject}`,
      text: body,
    });
    return true;
  } catch (e) {
    console.error("notifyOwner failed", e);
    return false;
  }
}
