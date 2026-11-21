-- KD-026 staging-only regression. Run AFTER reviewed migration is applied to staging.
-- All assertions execute inside a transaction and are rolled back. Never run on production.
BEGIN;
DO $test$
DECLARE
  before_count bigint;
  after_count bigint;
  blocked boolean := false;
BEGIN
  IF has_function_privilege('anon', 'public.create_workspace(text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: anon can execute workspace creation';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.create_workspace(text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: guarded authenticated RPC unavailable';
  END IF;
  IF pg_get_functiondef('public.create_workspace(text,text)'::regprocedure)
      NOT LIKE '%wm.role IN (''owner'', ''admin'')%' THEN
    RAISE EXCEPTION 'FAIL: owner/admin database guard missing';
  END IF;
  SELECT count(*) INTO before_count FROM public.workspaces;
  BEGIN
    PERFORM public.create_workspace('KD026 synthetic denied', 'kd026-denied-test');
  EXCEPTION WHEN insufficient_privilege THEN
    blocked := true;
  END;
  IF NOT blocked THEN
    RAISE EXCEPTION 'FAIL: no-session workspace creation succeeded';
  END IF;
  SELECT count(*) INTO after_count FROM public.workspaces;
  IF after_count <> before_count THEN
    RAISE EXCEPTION 'FAIL: denied RPC changed workspace count';
  END IF;
  RAISE NOTICE 'PASS: RPC grants, guard, no-session denial, no insert';
END
$test$;
-- Exercise the actual authenticated database role, not only a privileged SQL caller.
-- The synthetic JWT subject is deliberately absent from auth.users and workspace_members.
-- No Auth rows are inserted. Any unexpected success raises and rolls back the transaction.
-- Capture the global count as the privileged runner, outside authenticated RLS.
CREATE TEMP TABLE kd026_workspace_baseline ON COMMIT DROP AS
  SELECT count(*)::bigint AS workspace_count FROM public.workspaces;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000026', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
DO $unassigned$
DECLARE
  denied boolean := false;
BEGIN
  IF auth.uid() IS DISTINCT FROM '00000000-0000-4000-8000-000000000026'::uuid THEN
    RAISE EXCEPTION 'FAIL: synthetic authenticated subject not recognised';
  END IF;
  BEGIN
    PERFORM public.create_workspace('KD026 unassigned denied', 'kd026-unassigned-denied');
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'FAIL: unassigned authenticated user created a workspace';
  END IF;
  RAISE NOTICE 'PASS: authenticated unassigned synthetic subject denied';
END
$unassigned$;
RESET ROLE;
-- Check global mutation only after restoring the privileged runner's RLS visibility.
DO $verify_global_count$
BEGIN
  IF (SELECT count(*) FROM public.workspaces) <>
     (SELECT workspace_count FROM kd026_workspace_baseline) THEN
    RAISE EXCEPTION 'FAIL: authenticated denied RPC changed global workspace count';
  END IF;
  RAISE NOTICE 'PASS: privileged global workspace count unchanged';
END
$verify_global_count$;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', '', true);
ROLLBACK;
-- Follow-up authenticated staging UAT: owner/admin allowed, client/member/unassigned
-- denied, cross-workspace isolation, duplicate slug rollback and concurrent attempts.
