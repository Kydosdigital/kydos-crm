"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

function reject(message: string): never {
  redirect(`/tasks?error=${encodeURIComponent(message)}`);
}

function londonOffsetMs(local: string) {
  const asUtc = new Date(local + "Z");
  const london = new Date(asUtc.toLocaleString("en-US", { timeZone: "Europe/London" }));
  const utc = new Date(asUtc.toLocaleString("en-US", { timeZone: "UTC" }));
  return london.getTime() - utc.getTime();
}

/** Create a standalone task with an optional staff assignee. */
export async function createBoardTask(fd: FormData) {
  const { ws } = await requireStaff();
  const title = String(fd.get("title") ?? "").trim();
  const ownerId = String(fd.get("assigned_to") ?? "").trim();
  const localDue = String(fd.get("due_at") ?? "").trim();
  if (!title || title.length > 240) reject("Enter a task title of up to 240 characters");
  let due_at: string | null = null;
  if (localDue) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localDue)) reject("Choose a valid due date and time");
    const due = new Date(new Date(localDue + "Z").getTime() - londonOffsetMs(localDue));
    if (!Number.isFinite(due.getTime())) reject("Choose a valid due date and time");
    due_at = due.toISOString();
  }
  if (ownerId) {
    const { data: member, error } = await supabaseAdmin().from("workspace_members")
      .select("user_id,role").eq("workspace_id", ws.id).eq("user_id", ownerId).maybeSingle();
    if (error || !member || member.role === "client") reject("Choose a member of this workspace");
  }
  const { error } = await (await supabaseServer()).from("tasks").insert({
    workspace_id: ws.id, contact_id: null, title, due_at, assigned_to: ownerId || null,
  });
  if (error) reject("Could not create task. Please try again");
  revalidatePath("/tasks");
}
