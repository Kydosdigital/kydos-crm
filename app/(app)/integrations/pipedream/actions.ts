"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/workspace";
import { createWorkspacePipedreamLink, pipedreamConfigured, validPipedreamAppSlug } from "@/lib/pipedream-connect";

/**
 * The only permitted side effect is asking Pipedream to create an expiring
 * account-authorisation link. No third-party API actions are executed here.
 */
export async function startPipedreamConnection(formData: FormData) {
  const { ws } = await requireAdmin();
  const app = String(formData.get("app") ?? "").trim().toLowerCase();
  if (!validPipedreamAppSlug(app)) {
    redirect("/integrations/pipedream?error=invalid-app");
  }
  if (!pipedreamConfigured()) {
    redirect("/integrations/pipedream?error=not-configured");
  }

  let link: string;
  try {
    link = await createWorkspacePipedreamLink(ws.id, app);
  } catch {
    // Deliberately avoid revealing OAuth credentials, tokens or upstream error payloads.
    redirect("/integrations/pipedream?error=connection-unavailable");
  }
  redirect(link);
}
