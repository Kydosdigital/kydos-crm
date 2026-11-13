"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { ONBOARDING_STEPS, SERVICE_ONBOARDING_TEMPLATES, onboardingTitles } from "@/lib/onboarding-checklist";

const go = (message: string, type: "error" | "done"): never =>
  redirect(`/onboarding?${type}=${encodeURIComponent(message)}`);

/** Start missing checklist tasks for the active workspace, leaving existing answers unchanged. */
export async function initialiseOnboarding() {
  const { ws } = await requireStaff();
  const db = await supabaseServer();
  const { data, error } = await db.from("tasks").select("title")
    .eq("workspace_id", ws.id).in("title", ONBOARDING_STEPS.map((step) => step.title));
  if (error) go("Could not read onboarding progress", "error");
  const present = new Set((data ?? []).map((task) => task.title));
  const missing = ONBOARDING_STEPS.filter((step) => !present.has(step.title));
  if (missing.length === 0) go("Your checklist is already in place", "done");

  const { error: insertError } = await db.from("tasks").insert(
    missing.map((step) => ({ workspace_id: ws.id, title: step.title, contact_id: null, done: false })),
  );
  if (insertError) go("Could not create the checklist. Please try again", "error");
  revalidatePath("/onboarding");
  revalidatePath("/tasks");
  go(`Added ${missing.length} onboarding steps`, "done");
}

/** Add only the service-specific tasks requested, preserving existing progress. */
export async function initialiseServiceOnboarding(fd: FormData) {
  const { ws } = await requireStaff();
  const choice = String(fd.get("service") ?? "");
  if (!(choice in SERVICE_ONBOARDING_TEMPLATES)) return go("Choose a supported service", "error");
  const template = SERVICE_ONBOARDING_TEMPLATES[choice as keyof typeof SERVICE_ONBOARDING_TEMPLATES];
  const db = await supabaseServer();
  const { data, error } = await db.from("tasks").select("title")
    .eq("workspace_id", ws.id).in("title", template.steps.map((step) => step.title));
  if (error) return go("Could not read service onboarding progress", "error");
  const present = new Set((data ?? []).map((task) => task.title));
  const missing = template.steps.filter((step) => !present.has(step.title));
  if (!missing.length) return go("This service checklist is already in place", "done");
  const { error: insertError } = await db.from("tasks").insert(
    missing.map((step) => ({ workspace_id: ws.id, title: step.title, contact_id: null, done: false })),
  );
  if (insertError) return go("Could not create the service checklist", "error");
  revalidatePath("/onboarding");
  revalidatePath("/tasks");
  go("Added " + missing.length + " " + template.label + " onboarding steps", "done");
}

/** Only toggle a recognised onboarding task in the current workspace. */
export async function updateOnboardingStep(fd: FormData) {
  const { ws } = await requireStaff();
  const id = String(fd.get("id") ?? "");
  const db = await supabaseServer();
  const { data: current, error: readError } = await db.from("tasks")
    .select("title,done").eq("workspace_id", ws.id).eq("id", id).maybeSingle();
  if (readError || !current) return go("Onboarding task not found", "error");
  if (!onboardingTitles.has(current.title)) return go("Onboarding task not found", "error");

  const { data, error } = await db.from("tasks").update({ done: !current.done })
    .eq("workspace_id", ws.id).eq("id", id).eq("done", current.done)
    .select("id").maybeSingle();
  if (error || !data) go("Could not update this step. Refresh and try again", "error");
  revalidatePath("/onboarding");
  revalidatePath("/tasks");
  go("Checklist updated", "done");
}
