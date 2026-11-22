import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../app/api/forms/[slug]/route.ts", import.meta.url), "utf8");
const hosted = readFileSync(new URL("../app/f/form/[slug]/client.tsx", import.meta.url), "utf8");
const settings = readFileSync(new URL("../app/(app)/settings/page.tsx", import.meta.url), "utf8");

test("hosted and embedded forms use the same honeypot key as the API", () => {
  for (const source of [route, hosted, settings]) assert.match(source, /kd_hp_contact/);
  assert.match(route, /if \(f\[HONEYPOT_FIELD\] !== undefined/);
  assert.match(route, /return Response\.json\(\{ ok: true \}/);
  assert.ok(route.indexOf("if (f[HONEYPOT_FIELD]") < route.indexOf("const db = supabaseAdmin()"), "bot path must not open a privileged database client");
});

test("handler bounds both declared and actual payload size before parsing JSON", () => {
  assert.match(route, /MAX_BODY_BYTES = 16 \* 1024/);
  assert.match(route, /declared > MAX_BODY_BYTES/);
  assert.match(route, /TextEncoder\(\)\.encode\(raw\)\.length > MAX_BODY_BYTES/);
  assert.ok(route.indexOf("TextEncoder().encode(raw)") < route.indexOf("JSON.parse(raw)"));
});

test("website embed only displays success after a successful HTTP response", () => {
  assert.match(settings, /ok = res\.ok/);
  assert.match(settings, /if \(ok\) \{ e\.target\.innerHTML/);
  assert.match(settings, /data-kydos-error/);
});

test("email matching escapes SQL LIKE wildcards", () => {
  assert.match(route, /f\.email\.replace\(/);
  assert.match(route, /q\.ilike\("email"/);
});
