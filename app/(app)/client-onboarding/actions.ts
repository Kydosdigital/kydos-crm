"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { ONBOARDING_STEPS, onboardingTitles } from "@/lib/onboarding-checklist";

const go = (message: string, type: "error" | "done"): never =>
  redirect(`/client-onboarding?${type}=${encodeURIComponent(message)}`);

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
  revalidatePath("/client-onboarding");
  revalidatePath("/tasks");
  go(`Added ${missing.length} onboarding steps`, "done");
}

/** Only toggle a recognised onboarding task in the current workspace. */
export async function updateOnboardingStep(fd: FormData) {
  const { ws } = await requireStaff();
  const id = String(fd.get("id") ?? "");
  const requested = String(fd.get("done") ?? "");
  const expected = String(fd.get("expectedDone") ?? "");
  if ((requested !== "true" && requested !== "false") || (expected !== "true" && expected !== "false")) return go("Invalid checklist update", "error");
  const desiredDone = requested === "true";
  const db = await supabaseServer();
  const { data: current, error: readError } = await db.from("tasks")
    .select("title,done").eq("workspace_id", ws.id).eq("id", id).is("contact_id", null).maybeSingle();
  if (readError || !current) return go("Onboarding task not found", "error");
  if (!onboardingTitles.has(current.title)) return go("Onboarding task not found", "error");
  // A stale or repeated form submission must never undo an already applied change.
  // A retried submission that has already reached its requested state is harmless.
  if (current.done === desiredDone) return go("Checklist already updated", "done");
  if (current.done !== (expected === "true")) return go("Checklist changed since you opened it. Refresh and try again", "error");

  const { data, error } = await db.from("tasks").update({ done: desiredDone })
    .eq("workspace_id", ws.id).eq("id", id).is("contact_id", null).eq("done", current.done)
    .in("title", ONBOARDING_STEPS.map((step) => step.title))
    .select("id").maybeSingle();
  if (error || !data) go("Could not update this step. Refresh and try again", "error");
  revalidatePath("/client-onboarding");
  revalidatePath("/tasks");
  go("Checklist updated", "done");
}
