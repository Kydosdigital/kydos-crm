// Static integration regression for PR #40. Run: node --test tests/auth-onboarding-boundary.test.mjs
// This is a source-level safety gate, not a substitute for authenticated staging UAT.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const signup = read("app/signup/actions.ts");
const onboarding = read("app/onboarding/page.tsx");

test("signup never assigns a workspace or role from registration input", () => {
  assert.match(signup, /supabase\.auth\.signUp\(/);
  assert.match(signup, /data:\s*\{\s*full_name:\s*name\s*\}/);
  assert.doesNotMatch(signup, /(?:from\(["']workspace_members["']\)|create_workspace|role:\s*["'](?:owner|admin|member|client)["'])/);
  assert.match(signup, /new URL\(["']\/auth\/callback\?next=%2Fonboarding["'],\s*base\)/);
});

test("zero-membership onboarding is authenticated and never requires staff privileges", () => {
  assert.match(onboarding, /db\.auth\.getUser\(\)/);
  assert.match(onboarding, /if\s*\(authError\s*\|\|\s*!user\)\s*redirect\(["']\/login["']\)/);
  assert.match(onboarding, /\.from\(["']workspace_members["']\)[\s\S]*?\.eq\(["']user_id["'],\s*user\.id\)/);
  assert.match(onboarding, /if\s*\(!error\s*&&\s*data\?\.length\)\s*redirect\(["']\/contacts["']\)/);
  assert.doesNotMatch(onboarding, /requireStaff\(|requireAdmin\(|create_workspace\(/);
});

test("membership lookup failure never grants CRM navigation", () => {
  assert.match(onboarding, /\{error\s*\?\s*\(/);
  assert.match(onboarding, /couldn&apos;t check your business access/);
});

test("PKCE callback fails closed on malformed or failed exchanges", () => {
  const callback = read("app/auth/callback/route.ts");
  assert.match(callback, /const NEXT = new Set\(\["\/onboarding", "\/contacts"\]\)/);
  assert.match(callback, /NEXT\.has\(next \?\? ""\) \? next! : "\/onboarding"/);
  assert.match(callback, /!code\.trim\(\)/);
  assert.match(callback, /code !== code\.trim\(\)/);
  assert.match(callback, /code\.length > 2048/);
  assert.match(callback, /exchangeCodeForSession\(code\)/);
  assert.match(callback, /if \(error \|\| !data\?\.session \|\| !data\?\.user\)/);
  assert.match(callback, /catch \{[\s\S]*?\/login\?error=verify/);
  assert.doesNotMatch(callback, /console\.(?:log|error|warn)\(/);
});

test("scanner-safe OTP confirmation fails closed and never exposes provider errors", () => {
  const confirm = read("app/auth/confirm/route.ts");
  assert.ok(confirm.includes('method=post action='));
  assert.ok(confirm.includes('typeof token_hash !== "string"'));
  assert.ok(confirm.includes('typeof type !== "string"'));
  assert.ok(confirm.includes('"email", "signup", "invite", "magiclink", "recovery"'));
  assert.ok(confirm.includes('db.auth.verifyOtp({ token_hash, type: type as EmailOtpType })'));
  assert.ok(confirm.includes('if (error || !data?.session || !data?.user) return failed()'));
  assert.ok(confirm.includes('/login?error=verify'));
  assert.ok(!confirm.includes('error.message'));
  assert.ok(!confirm.includes('console.error('));
});

test("workspace creation server action requires existing admin membership", () => {
  const actions = read("app/actions.ts");
  const match = actions.match(/export async function createWorkspace\(fd: FormData\) \{([\s\S]*?)\n\}/);
  assert.ok(match, "createWorkspace action must exist");
  assert.match(match[1], /await requireAdmin\(\)/);
  assert.ok(match[1].indexOf("await requireAdmin()") < match[1].indexOf('db.rpc("create_workspace"'), "authorisation must precede RPC");
});
