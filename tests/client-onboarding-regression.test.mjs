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
  assert.match(action, /\.eq\("workspace_id", ws\.id\)\.eq\("id", id\)\.eq\("done", current\.done\)/);
  assert.doesNotMatch(action, /done:\s*!current\.done/);
});

test("initialisation remains a documented release blocker until atomic per-client uniqueness exists", () => {
  assert.match(action, /contact_id: null/);
  assert.match(action, /const missing = ONBOARDING_STEPS\.filter/);
});
