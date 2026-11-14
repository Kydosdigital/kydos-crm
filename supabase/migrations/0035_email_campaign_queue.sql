-- KD-094: Non-sending, workspace-scoped email campaign queue foundation.
-- Migration 0035 follows staged KD-107 migration 0034 and PR #23's reserved 0028..0033.
-- Safe to develop/test in staging. DO NOT deploy to production on its own.
-- No existing campaign action, scheduler or provider endpoint is changed by this migration.

create table public.campaign_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_tag text not null check (length(btrim(source_tag)) between 1 and 100),
  channel text not null default 'email' check (channel = 'email'),
  status text not null default 'draft' check (status in ('draft','prepared','cancelled')),
  selected_count integer not null default 0 check (selected_count >= 0),
  queued_count integer not null default 0 check (queued_count >= 0),
  excluded_count integer not null default 0 check (excluded_count >= 0),
  created_at timestamptz not null default clock_timestamp(),
  prepared_at timestamptz,
  constraint campaign_batch_count_balance check (selected_count = queued_count + excluded_count)
);

create table public.campaign_batch_recipients (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.campaign_batches(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  recipient_email text,
  destination_key text,
  status text not null check (status in ('queued','sending','sent','failed','unknown','excluded')),
  exclusion_reason text,
  claim_token uuid,
  claim_started_at timestamptz,
  claim_expires_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (batch_id, contact_id),
  constraint campaign_recipient_exclusion_consistency
    check ((status = 'excluded') = (exclusion_reason is not null))
);
create unique index campaign_recipient_unique_send_destination
  on public.campaign_batch_recipients (batch_id, destination_key)
  where status <> 'excluded' and destination_key is not null;
create index campaign_recipient_dispatch_idx
  on public.campaign_batch_recipients (batch_id, status, created_at, id);
create index campaign_recipient_stale_idx
  on public.campaign_batch_recipients (claim_expires_at)
  where status = 'sending';

-- This is service-role-only infrastructure, not a browser-facing table.
alter table public.campaign_batches enable row level security;
alter table public.campaign_batch_recipients enable row level security;
revoke all on public.campaign_batches, public.campaign_batch_recipients from public, anon, authenticated;
grant select, insert, update, delete on public.campaign_batches, public.campaign_batch_recipients to service_role;

-- Reproducibly snapshot all tagged contacts (up to an explicit safe limit).
-- Do not slice to 90, silently omit exclusions, or fetch under pagination.
-- Lock the batch while preparing, preserving its immutable audience thereafter.
create or replace function public.prepare_email_campaign_batch(p_batch_id uuid)
returns public.campaign_batches
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_batch public.campaign_batches%rowtype;
  v_selected integer;
begin
  select * into v_batch
  from public.campaign_batches b where b.id = p_batch_id
  for update;
  if not found then raise exception 'Campaign batch not found'; end if;
  if v_batch.status = 'prepared' then return v_batch; end if;
  if v_batch.status <> 'draft' then raise exception 'Cannot prepare a cancelled batch'; end if;

  select count(*)::integer into v_selected
  from public.contacts c
  where c.workspace_id = v_batch.workspace_id
    and c.tags @> array[v_batch.source_tag]::text[];
  if v_selected > 10000 then
    raise exception 'Audience exceeds safe 10000-contact snapshot limit; no partial queue was created';
  end if;

  with ranked as (
    select
      c.id as contact_id,
      c.workspace_id,
      c.email,
      lower(btrim(c.email)) as email_key,
      c.email_opt_out,
      row_number() over (
        partition by lower(btrim(c.email))
        order by
          case when c.email_opt_out = false
                     and c.email ~* '^[a-z0-9._%+-]+@[a-z0-9.-]+[.][a-z]{2,}$' then 0 else 1 end,
          c.created_at, c.id
      ) as email_rank
    from public.contacts c
    where c.workspace_id = v_batch.workspace_id
      and c.tags @> array[v_batch.source_tag]::text[]
  ),
  snapshot as (
    select r.*,
      case
        when r.email is null or btrim(r.email) = '' then 'missing_email'
        when r.email_key !~* '^[a-z0-9._%+-]+@[a-z0-9.-]+[.][a-z]{2,}$' then 'invalid_email'
        when r.email_opt_out then 'opted_out'
        when r.email_rank > 1 then 'duplicate_destination'
        else null
      end as excluded_because
    from ranked r
  )
  insert into public.campaign_batch_recipients (
    batch_id, workspace_id, contact_id, recipient_email,
    destination_key, status, exclusion_reason
  )
  select v_batch.id, v_batch.workspace_id, s.contact_id, s.email,
    s.email_key,
    case when s.excluded_because is null then 'queued' else 'excluded' end,
    s.excluded_because
  from snapshot s
  on conflict (batch_id, contact_id) do nothing;

  update public.campaign_batches b
  set status = 'prepared',
      prepared_at = clock_timestamp(),
      selected_count = v_selected,
      queued_count = (select count(*) from public.campaign_batch_recipients r
                      where r.batch_id = v_batch.id and r.status = 'queued'),
      excluded_count = (select count(*) from public.campaign_batch_recipients r
                        where r.batch_id = v_batch.id and r.status = 'excluded')
  where b.id = v_batch.id
  returning * into v_batch;

  if v_batch.selected_count <> v_batch.queued_count + v_batch.excluded_count then
    raise exception 'Campaign queue mismatch, snapshot rolled back';
  end if;
  return v_batch;
end;
$fn$;

-- This function only claims rows. It DOES NOT dispatch provider messages.
-- A later audited worker must re-read current opt-outs and cancellation before delivery.
create or replace function public.claim_email_campaign_recipients(p_batch_id uuid, p_limit integer default 20)
returns setof public.campaign_batch_recipients
language sql
security definer
set search_path = public, pg_temp
as $fn$
  with eligible as (
    select r.id
    from public.campaign_batch_recipients r
    join public.campaign_batches b on b.id = r.batch_id and b.workspace_id = r.workspace_id
    where r.batch_id = p_batch_id
      and b.status = 'prepared'
      and b.channel = 'email'
      and r.status = 'queued'
      and r.claim_token is null
    order by r.created_at, r.id
    limit least(greatest(coalesce(p_limit, 20), 1), 20)
    for update of r skip locked
  )
  update public.campaign_batch_recipients r
    set status = 'sending',
        claim_token = gen_random_uuid(),
        claim_started_at = clock_timestamp(),
        claim_expires_at = clock_timestamp() + interval '10 minutes',
        attempt_count = r.attempt_count + 1,
        updated_at = clock_timestamp()
  from eligible
  where r.id = eligible.id
  returning r.*;
$fn$;

-- A send result must be acknowledged with exactly the owned claim token.
-- Unknown outcomes are quarantined, NOT silently retried.
create or replace function public.finish_email_campaign_recipient(
  p_recipient_id uuid,
  p_claim_token uuid,
  p_result text,
  p_provider_message_id text default null,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_id uuid;
begin
  if p_result not in ('sent','failed','unknown') then
    raise exception 'Invalid campaign delivery result';
  end if;
  if p_result = 'sent' and nullif(btrim(coalesce(p_provider_message_id,'')), '') is null then
    raise exception 'Provider message id required to mark delivered to provider';
  end if;
  update public.campaign_batch_recipients r
  set status = p_result,
      provider_message_id = p_provider_message_id,
      last_error = p_error,
      claim_token = null,
      claim_started_at = null,
      claim_expires_at = null,
      updated_at = clock_timestamp()
  where r.id = p_recipient_id
    and r.status = 'sending'
    and r.claim_token = p_claim_token
  returning r.id into v_id;
  return v_id is not null;
end;
$fn$;

create or replace function public.quarantine_expired_email_campaign_claims()
returns integer
language sql
security definer
set search_path = public, pg_temp
as $fn$
  with changed as (
    update public.campaign_batch_recipients r
    set status = 'unknown',
        last_error = 'Claim expired: verify the provider outcome before retry',
        claim_token = null,
        claim_started_at = null,
        claim_expires_at = null,
        updated_at = clock_timestamp()
    where r.status = 'sending'
      and r.claim_token is not null
      and r.claim_expires_at <= clock_timestamp()
    returning r.id
  )
  select count(*)::integer from changed;
$fn$;

revoke all on function public.prepare_email_campaign_batch(uuid) from public, anon, authenticated;
revoke all on function public.claim_email_campaign_recipients(uuid, integer) from public, anon, authenticated;
revoke all on function public.finish_email_campaign_recipient(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.quarantine_expired_email_campaign_claims() from public, anon, authenticated;

grant execute on function public.prepare_email_campaign_batch(uuid) to service_role;
grant execute on function public.claim_email_campaign_recipients(uuid, integer) to service_role;
grant execute on function public.finish_email_campaign_recipient(uuid, uuid, text, text, text) to service_role;
grant execute on function public.quarantine_expired_email_campaign_claims() to service_role;
