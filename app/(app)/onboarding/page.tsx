import { ClipboardCheck, Circle, CheckCircle2, Plus } from "lucide-react";
import { requireStaff } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { ONBOARDING_STEPS } from "@/lib/onboarding-checklist";
import { initialiseOnboarding, updateOnboardingStep } from "./actions";
import { Alert, Badge, Card, Page, PageHeader } from "@/components/ui";

export default async function Onboarding({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  const { done, error } = await searchParams;
  const { ws } = await requireStaff();
  const db = await supabaseServer();
  const { data: tasks, error: queryError } = await db.from("tasks")
    .select("id,title,done,assigned_to")
    .eq("workspace_id", ws.id)
    .in("title", ONBOARDING_STEPS.map((s) => s.title))
    .order("created_at", { ascending: true });
  const byTitle = new Map((tasks ?? []).map((task) => [task.title, task]));
  const completed = ONBOARDING_STEPS.filter((step) => byTitle.get(step.title)?.done).length;
  const started = (tasks ?? []).length > 0;

  return (
    <Page>
      <PageHeader title="Client onboarding"
        description={`Standard setup milestones for ${ws.name}. Each workspace tracks its own checklist.`}
        meta={<Badge tone={completed === ONBOARDING_STEPS.length ? "success" : "outline"}>
          {completed} of {ONBOARDING_STEPS.length} complete
        </Badge>}
      />
      {error && <Alert tone="danger">{error}</Alert>}
      {done && <Alert tone="success">{done}</Alert>}
      {queryError && <Alert tone="danger">Could not load onboarding progress. Please retry.</Alert>}

      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_290px]">
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-ink">Getting ready to deliver</h2>
          <div className="space-y-3">
            {ONBOARDING_STEPS.map((step, index) => {
              const task = byTitle.get(step.title);
              const checked = task?.done ?? false;
              return (
                <div key={step.key} className="flex items-start gap-3 border-b border-line pb-3 last:border-0 last:pb-0">
                  <div className="mt-0.5 shrink-0 text-muted">
                    {checked ? <CheckCircle2 className="h-5 w-5 text-success-ink" aria-hidden /> : <Circle className="h-5 w-5" aria-hidden />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-ink">{index + 1}. {step.title.replace("Onboarding: ", "")}</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted">{step.description}</p>
                  </div>
                  {task && <form action={updateOnboardingStep}>
                    <input type="hidden" name="id" value={task.id} />
                    <button className="btn btn-secondary btn-sm">{checked ? "Reopen" : "Complete"}</button>
                  </form>}
                </div>
              );
            })}
          </div>
          {!queryError && (!started || ONBOARDING_STEPS.some((s) => !byTitle.has(s.title))) && (
            <form action={initialiseOnboarding} className="mt-5 border-t border-line pt-4">
              <button className="btn btn-primary"><Plus aria-hidden />{started ? "Add missing steps" : "Start onboarding"}</button>
            </form>
          )}
        </Card>
        <aside className="card h-fit p-5">
          <ClipboardCheck className="mb-3 h-6 w-6 text-brand-text" aria-hidden />
          <h2 className="text-sm font-semibold text-ink">How this works</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            Your checklist is saved as tasks within this workspace. Staff can mark steps complete or reopen them. No other workspace's checklist is affected.
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            Assign owners and dates on the Tasks board. Record sensitive account credentials in an approved password manager, not in task titles.
          </p>
          <a href="/tasks" className="link mt-4 inline-block text-[13px]">Open tasks</a>
        </aside>
      </div>
    </Page>
  );
}
