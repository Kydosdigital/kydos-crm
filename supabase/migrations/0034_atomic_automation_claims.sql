-- KD-107: claim due automation steps atomically.
-- Only the service role may run these SECURITY DEFINER functions.
-- Migration 0034 is reserved after PR #23's unmerged 0028-0033 files.
-- Apply to staging and complete concurrency/failure tests BEFORE a production release.

alter table public.automation_runs
  add column if not exists claim_token uuid,
  add column if not exists claim_started_at timestamptz,
  add column if not exists claim_expires_at timestamptz;

create index if not exists automation_runs_unclaimed_due_idx
  on public.automation_runs (next_run_at, id)
  where status = 'active' and claim_token is null;

create index if not exists automation_runs_claim_timeout_idx
  on public.automation_runs (claim_expires_at)
  where status = 'active' and claim_token is not null;

-- A single UPDATE backed by row-level SKIP LOCKED selection guarantees that
-- concurrent schedulers cannot claim the same run at the same time.
-- Paused automations are never selected. Returning a token lets the worker
-- update/release only its own claim.
create or replace function public.claim_due_automation_runs(p_limit integer default 50, p_exclude_ids uuid[] default '{}'::uuid[])
returns setof public.automation_runs
language sql
security definer
set search_path = public, pg_temp
as $function$
  with due as (
    select r.id
    from public.automation_runs r
    join public.automations a
      on a.id = r.automation_id and a.workspace_id = r.workspace_id
    where r.status = 'active'
      and r.claim_token is null
      and r.next_run_at <= clock_timestamp()
      and a.active is true
      and not (r.id = any(coalesce(p_exclude_ids, '{}'::uuid[])) )
    order by r.next_run_at, r.id
    limit least(greatest(coalesce(p_limit, 50), 1), 50)
    for update of r skip locked
  )
  update public.automation_runs r
  set claim_token = gen_random_uuid(),
      claim_started_at = clock_timestamp(),
      claim_expires_at = clock_timestamp() + interval '10 minutes'
  from due
  where r.id = due.id
  returning r.*;
$function$;

-- An interrupted send might have reached its provider before the worker died.
-- NEVER automatically replay an expired claim. Quarantine it as failed for
-- manual investigation and a separate idempotent retry design (KD-109).
create or replace function public.expire_stale_automation_claims()
returns table (run_id uuid, workspace_id uuid)
language sql
security definer
set search_path = public, pg_temp
as $function$
  update public.automation_runs r
  set status = 'failed',
      last_error = 'Automation claim expired. Verify provider side effects before manual retry.',
      claim_token = null,
      claim_started_at = null,
      claim_expires_at = null
  where r.status = 'active'
    and r.claim_token is not null
    and r.claim_expires_at <= clock_timestamp()
  returning r.id, r.workspace_id;
$function$;

-- Supabase grants EXECUTE on new functions to PUBLIC by default unless revoked.
revoke all on function public.claim_due_automation_runs(integer, uuid[])
  from public, anon, authenticated;
revoke all on function public.expire_stale_automation_claims()
  from public, anon, authenticated;
grant execute on function public.claim_due_automation_runs(integer, uuid[]) to service_role;
grant execute on function public.expire_stale_automation_claims() to service_role;
