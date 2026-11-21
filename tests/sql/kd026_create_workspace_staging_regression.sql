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
ROLLBACK;
-- Follow-up authenticated staging UAT: owner/admin allowed, client/member/unassigned
-- denied, cross-workspace isolation, duplicate slug rollback and concurrent attempts.
