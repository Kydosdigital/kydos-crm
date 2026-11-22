import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const action = readFileSync("app/(app)/client-onboarding/actions.ts", "utf8");
const page = readFileSync("app/(app)/client-onboarding/page.tsx", "utf8");

test("staff-only onboarding never claims the account-setup /onboarding route", () => {
  assert.match(action, /requireStaff\(\)/);
  assert.match(page, /requireStaff\(\)/);
  assert.match(action, /revalidatePath\("\/client-onboarding"\)/);
  assert.doesNotMatch(action, /revalidatePath\("\/onboarding"\)/);
});

test("stale submissions specify a target state and cannot blindly invert completion", () => {
  assert.match(page, /name="done" value=\{String\(!checked\)\}/);
  assert.match(action, /requested !== "true" && requested !== "false"/);
  assert.match(action, /current\.done === desiredDone/);
  assert.match(page, /name="expectedDone" value=\{String\(checked\)\}/);
  assert.match(action, /expected !== "true" && expected !== "false"/);
  assert.match(action, /current\.done !== \(expected === "true"\)/);
  assert.match(action, /\.eq\("workspace_id", ws\.id\)\.eq\("id", id\)\.eq\("done", current\.done\)/);
  assert.doesNotMatch(action, /done:\s*!current\.done/);
});

test("replayed desired state is idempotent before stale-state rejection", () => {
  const idempotent = action.indexOf('if (current.done === desiredDone) return go("Checklist already updated", "done")');
  const stale = action.indexOf('if (current.done !== (expected === "true"))');
  assert.ok(idempotent >= 0 && stale >= 0 && idempotent < stale,
    "a retry after a successful update must not be reported as a stale conflict");
});

test("atomic update rechecks the onboarding title allowlist", () => {
  assert.match(action, /\.eq\("done", current\.done\)\s*\.in\("title", ONBOARDING_STEPS\.map\(\(step\) => step\.title\)\)/);
  assert.match(action, /if \(!onboardingTitles\.has\(current\.title\)\)/);
});

test("duplicate workspace milestones fail closed rather than silently choosing one", () => {
  assert.match(page, /new Set\(titles\)\.size !== titles\.length/);
  assert.match(page, /hasDuplicateSteps && <Alert tone="danger">/);
  assert.match(page, /task && !hasDuplicateSteps && !queryError && <form action=\{updateOnboardingStep\}/);
  assert.match(page, /!queryError && !hasDuplicateSteps && \(!started/);
});

test("workspace checklist view excludes client-linked tasks before duplicate detection", () => {
  assert.match(page, /\.eq\("workspace_id", ws\.id\)\s*\.is\("contact_id", null\)\s*\.in\("title", ONBOARDING_STEPS/);
  assert.match(action, /\.eq\("workspace_id", ws\.id\)\.is\("contact_id", null\)/);
});
