-- KD-094: staging-only, rollback-only 250-person email queue test.
-- Requires staging QA Alpha/Beta workspace fingerprint, never run on production.
-- All fixtures and batch changes are ROLLED BACK at the end. No provider sends.

begin;

do $guard$
begin
  if (select count(*) from public.workspaces
      where (id,slug,name) in (
        ('df55bd02-9862-4d69-aa75-fc5ac67389cb'::uuid, 'kydos-qa-alpha-20261114', 'QA SYNTHETIC Alpha'),
        ('cdf44e6c-0ba4-40e8-b900-53fc1c1d455b'::uuid, 'kydos-qa-beta-20261114', 'QA SYNTHETIC Beta')
      ) and agent_mode='off' and daily_digest=false
        and email_from is null and sms_from is null and whatsapp_from is null
     ) <> 2 then
    raise exception 'STAGING QA FINGERPRINT FAILED, TEST REFUSED';
  end if;
  if (select count(*) from auth.users) <> 0 then
    raise exception 'Staging QA Auth users now exist. Re-review fixture permissions before rerun';
  end if;
  if exists (select 1 from public.contacts where tags @> array['qa-kd094-seed']::text[]) then
    raise exception 'Previous QA test contacts detected, refusing to overwrite';
  end if;
end;
$guard$;

-- 250 eligible, two opt-outs, one invalid address, one missing email,
-- and one duplicate normalised address with trailing whitespace.
insert into public.contacts (workspace_id,first_name,last_name,email,source,tags,email_opt_out,sms_opt_out)
select w.id,'QA',format('Queue%03s', g.n),format('qa-kd094-%s@example.test',lpad(g.n::text,3,'0')),
       'qa-kd094-synthetic',array['qa-kd094-seed'],false,true
from public.workspaces w cross join generate_series(1,250) as g(n)
where w.slug='kydos-qa-alpha-20261114';

insert into public.contacts (workspace_id,first_name,last_name,email,source,tags,email_opt_out,sms_opt_out)
select w.id, 'QA', row.name, row.email, 'qa-kd094-synthetic',
       array['qa-kd094-seed'], row.opted_out, true
from public.workspaces w
cross join (values
  ('OptOutA', 'qa-kd094-optout-a@example.test', true),
  ('OptOutB', 'qa-kd094-optout-b@example.test', true),
  ('Invalid', 'not-an-email', false),
  ('NoEmail', null::text, false),
  ('Duplicate', 'qa-kd094-001@example.test ', false)
) as row(name,email,opted_out)
where w.slug='kydos-qa-alpha-20261114';

-- The Beta contact has the SAME tag but must not enter Alpha's batch.
insert into public.contacts (workspace_id,first_name,last_name,email,source,tags,email_opt_out,sms_opt_out)
select w.id,'QA','OtherTenant','qa-kd094-other-tenant@example.test',
       'qa-kd094-synthetic',array['qa-kd094-seed'],false,true
from public.workspaces w
where w.slug='kydos-qa-beta-20261114';

do $test$
declare
  v_batch uuid;
  v_stats public.campaign_batches%rowtype;
  v_recipient public.campaign_batch_recipients%rowtype;
  v_other public.campaign_batch_recipients%rowtype;
  v_count integer;
  v_ok boolean;
begin
  insert into public.campaign_batches(workspace_id,source_tag,channel)
  select id,'qa-kd094-seed','email' from public.workspaces where slug='kydos-qa-alpha-20261114'
  returning id into v_batch;

  select * into v_stats from public.prepare_email_campaign_batch(v_batch);
  if v_stats.selected_count <> 255 or v_stats.queued_count <> 250 or v_stats.excluded_count <> 5 then
    raise exception 'EXPECTED 255 selected, 250 queued, 5 excluded; got %, %, %',
      v_stats.selected_count,v_stats.queued_count,v_stats.excluded_count;
  end if;
  if (select count(*) from public.campaign_batch_recipients where batch_id=v_batch) <> 255 then
    raise exception 'Missing or duplicate recipient snapshots';
  end if;
  if (select count(*) from public.campaign_batch_recipients
      where batch_id=v_batch and exclusion_reason='opted_out') <> 2 then
    raise exception 'Opt-out selection incorrect';
  end if;
  if (select count(*) from public.campaign_batch_recipients
      where batch_id=v_batch and exclusion_reason in ('missing_email','invalid_email','duplicate_destination')) <> 3 then
    raise exception 'Invalid, missing or duplicate address selection incorrect';
  end if;
  if exists (
    select 1 from public.campaign_batch_recipients r
    join public.contacts c on c.id=r.contact_id
    where r.batch_id=v_batch and c.workspace_id<>v_stats.workspace_id
  ) then raise exception 'Cross-workspace contact leaked'; end if;

  -- Re-preparing is idempotent and preserves the audience snapshot.
  select * into v_stats from public.prepare_email_campaign_batch(v_batch);
  if v_stats.queued_count<>250 or
      (select count(*) from public.campaign_batch_recipients where batch_id=v_batch)<>255 then
    raise exception 'Idempotent queue prepare changed counts';
  end if;

  -- Claim one, refuse unknown/wrong ownership, complete with fake provider ID.
  select * into v_recipient from public.claim_email_campaign_recipients(v_batch,1) limit 1;
  if v_recipient.id is null or v_recipient.claim_token is null then
    raise exception 'Could not claim a queued recipient';
  end if;
  select public.finish_email_campaign_recipient(v_recipient.id,gen_random_uuid(),'sent','synthetic-provider-id-1') into v_ok;
  if v_ok then raise exception 'Invalid claim token was accepted'; end if;
  select public.finish_email_campaign_recipient(v_recipient.id,v_recipient.claim_token,'sent','synthetic-provider-id-1') into v_ok;
  if not v_ok then raise exception 'Correct claim token was rejected'; end if;
  select public.finish_email_campaign_recipient(v_recipient.id,v_recipient.claim_token,'sent','synthetic-provider-id-1') into v_ok;
  if v_ok then raise exception 'Repeated checkpoint completion was accepted'; end if;

  -- Second claim deliberately expires and is quarantined as UNKNOWN.
  select * into v_other from public.claim_email_campaign_recipients(v_batch,1) limit 1;
  if v_other.id is null then raise exception 'Second claim unavailable'; end if;
  update public.campaign_batch_recipients set claim_expires_at=clock_timestamp()-interval '1 minute'
  where id=v_other.id and claim_token=v_other.claim_token;
  select public.quarantine_expired_email_campaign_claims() into v_count;
  if v_count<>1 or (select status from public.campaign_batch_recipients where id=v_other.id)<>'unknown' then
    raise exception 'Stale recipient was not safely quarantined';
  end if;

  -- A maximum of 20 claimed per worker, despite a larger requested limit.
  select count(*) into v_count from public.claim_email_campaign_recipients(v_batch,90);
  if v_count<>20 then raise exception 'Dispatch claim was not bounded to 20 rows'; end if;

  -- Cancelling a batch prevents further claims even while queued rows remain.
  update public.campaign_batches set status='cancelled' where id=v_batch;
  select count(*) into v_count from public.claim_email_campaign_recipients(v_batch,1);
  if v_count<>0 then raise exception 'Cancelled batch was still claimable'; end if;
  -- Reset only inside this rollback-only synthetic test.
  update public.campaign_batches set status='prepared' where id=v_batch;

  -- Simulate provider acknowledgements for every already-claimed row, never
  -- making an external call. A distinct fake ID represents each acceptance.
  for v_recipient in
    select * from public.campaign_batch_recipients
    where batch_id=v_batch and status='sending'
  loop
    select public.finish_email_campaign_recipient(
      v_recipient.id,v_recipient.claim_token,'sent','synthetic-provider-'||v_recipient.id::text
    ) into v_ok;
    if not v_ok then raise exception 'Failed to checkpoint a pre-claimed recipient'; end if;
  end loop;

  -- Repeated bounded claims must consume the entire remaining audience,
  -- including contacts beyond index 90, with no skipping or duplicate sends.
  loop
    v_count := 0;
    for v_recipient in select * from public.claim_email_campaign_recipients(v_batch,20)
    loop
      select public.finish_email_campaign_recipient(
        v_recipient.id,v_recipient.claim_token,'sent','synthetic-provider-'||v_recipient.id::text
      ) into v_ok;
      if not v_ok then raise exception 'Failed to checkpoint a recipient'; end if;
      v_count := v_count + 1;
    end loop;
    exit when v_count = 0;
  end loop;

  if (select count(*) from public.campaign_batch_recipients
      where batch_id=v_batch and status='sent') <> 249
    or (select count(*) from public.campaign_batch_recipients
        where batch_id=v_batch and status='unknown') <> 1
    or (select count(*) from public.campaign_batch_recipients
        where batch_id=v_batch and status='excluded') <> 5
    or (select count(*) from public.campaign_batch_recipients
        where batch_id=v_batch and status in ('queued','sending')) <> 0
    or (select sum(attempt_count) from public.campaign_batch_recipients
        where batch_id=v_batch and status <> 'excluded') <> 250 then
    raise exception '250-recipient progress reconciliation failed';
  end if;

  raise notice 'PASS KD-094: 255 snapshot, 250 eligible accounted, 5 excluded, 249 fake acknowledgements, 1 unknown, zero unprocessed, idempotence, tenant isolation, token checkpoints, stale quarantine, bounded claims and cancellation';
end;
$test$;

-- Roll back all test contacts, batch and checkpoints, including fake provider IDs.
rollback;

-- These counts must remain zero after the rollback.
select
  (select count(*) from public.contacts where source='qa-kd094-synthetic') as synthetic_test_contacts,
  (select count(*) from public.campaign_batches where source_tag='qa-kd094-seed') as synthetic_batches,
  (select count(*) from public.campaign_batch_recipients) as saved_recipients;
