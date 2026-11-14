-- KD-094 additional staging-first remediation after 0035 has already been applied.
-- Preserve campaign audit/checkpoint rows when contacts are deleted or merged.
-- Scrub recipient PII on deletion. Consistent email normalisation for ranking.
-- DO NOT apply to production before PR #23 (0028..0033), PR #33 (0034),
-- PR #35 (0035) and all staged QA/release gates are accepted.

alter table public.campaign_batch_recipients
  drop constraint campaign_batch_recipients_contact_id_fkey;
alter table public.campaign_batch_recipients
  alter column contact_id drop not null;
alter table public.campaign_batch_recipients
  add constraint campaign_batch_recipients_contact_id_fkey
  foreign key (contact_id) references public.contacts(id)
  on delete set null;

-- Original snapshot counts record the audience at preparation, not the live
-- delivery state. Per-recipient checkpoint rows remain for reconciliation.
create or replace function public.scrub_campaign_recipient_on_contact_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $trigger$
begin
  update public.campaign_batch_recipients r
  set
    recipient_email = null,
    destination_key = null,
    status = case
      when r.status = 'queued' then 'excluded'
      when r.status = 'sending' then 'unknown'
      else r.status end,
    exclusion_reason = case
      when r.status = 'queued' then 'contact_deleted'
      else r.exclusion_reason end,
    last_error = case
      when r.status in ('queued','sending') then
        'Contact deleted or merged. Do not send or automatically retry.'
      else r.last_error end,
    claim_token = null,
    claim_started_at = null,
    claim_expires_at = null,
    updated_at = clock_timestamp()
  where r.contact_id = old.id;
  return old;
end;
$trigger$;

drop trigger if exists campaign_contact_delete_scrub on public.contacts;
create trigger campaign_contact_delete_scrub
  before delete on public.contacts
  for each row
  execute function public.scrub_campaign_recipient_on_contact_delete();

-- Do not allow browser roles to call this privileged trigger function.
revoke all on function public.scrub_campaign_recipient_on_contact_delete()
  from public, anon, authenticated;

-- Previously c.email was validated RAW in the row_number ranking but
-- trimmed in the final inclusion test. Use the SAME trimmed validation for
-- both so an opted-in address with whitespace is not incorrectly excluded.
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
                     and btrim(c.email) ~* '^[a-z0-9._%+-]+@[a-z0-9.-]+[.][a-z]{2,} then 0 else 1 end,
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
 then 0 else 1 end,
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

-- New RPC definition preserves the existing execution permission policy.
revoke all on function public.prepare_email_campaign_batch(uuid)
  from public, anon, authenticated;
grant execute on function public.prepare_email_campaign_batch(uuid) to service_role;
