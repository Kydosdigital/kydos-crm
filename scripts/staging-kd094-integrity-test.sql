-- KD-094 corrective migration 0036: staging-only, rollback-only regression.
-- Test deleted/merged contacts, scrubbed PII and consistent duplicate ranking.
-- No providers called, no durable fixture rows created.
begin;

do $guard$
begin
 if (select count(*) from public.workspaces where
     (id,slug,name) in (
       ('df55bd02-9862-4d69-aa75-fc5ac67389cb'::uuid,'kydos-qa-alpha-20261114','QA SYNTHETIC Alpha'),
       ('cdf44e6c-0ba4-40e8-b900-53fc1c1d455b'::uuid,'kydos-qa-beta-20261114','QA SYNTHETIC Beta'))
     and agent_mode='off' and daily_digest=false
     and email_from is null and sms_from is null and whatsapp_from is null) <> 2
   then raise exception 'STAGING GUARD FAILED'; end if;
 if exists(select 1 from public.contacts where source='qa-kd094-integrity')
   then raise exception 'Unexpected old integration fixtures'; end if;
end;
$guard$;

do $test$
declare
 ws uuid;
 old_contact uuid;
 eligible_contact uuid;
 test_batch uuid;
 c uuid;
 b uuid;
 r public.campaign_batch_recipients%rowtype;
 result boolean;
 count_selected integer;
 count_queued integer;
 count_excluded integer;
begin
 select id into ws from public.workspaces where slug='kydos-qa-alpha-20261114';

 -- Older opted-out destination, newer eligible with trailing whitespace.
 insert into public.contacts(
   workspace_id,first_name,last_name,email,source,tags,email_opt_out,sms_opt_out,created_at
 ) values (
   ws,'QA','PreviouslyOptedOut','qa-kd094-dup@example.test','qa-kd094-integrity',
   array['qa-kd094-integ-dup'],true,true,clock_timestamp()-interval '2 days'
 ) returning id into old_contact;
 insert into public.contacts(
   workspace_id,first_name,last_name,email,source,tags,email_opt_out,sms_opt_out,created_at
 ) values (
   ws,'QA','EligibleWhitespace','qa-kd094-dup@example.test ','qa-kd094-integrity',
   array['qa-kd094-integ-dup'],false,true,clock_timestamp()-interval '1 day'
 ) returning id into eligible_contact;

 insert into public.campaign_batches(workspace_id,source_tag,channel)
 values (ws,'qa-kd094-integ-dup','email') returning id into test_batch;
 select selected_count,queued_count,excluded_count
   into count_selected,count_queued,count_excluded
   from public.prepare_email_campaign_batch(test_batch);
 if count_selected<>2 or count_queued<>1 or count_excluded<>1
   then raise exception 'Duplicate ranking counts wrong: % % %',count_selected,count_queued,count_excluded; end if;
 select * into r from public.campaign_batch_recipients
   where batch_id=test_batch and status='queued';
 if r.contact_id is distinct from eligible_contact
   then raise exception 'Trimmed eligible contact did not win duplicate ranking'; end if;

 -- Deleting this contact MUST preserve the checkpoint row while scrubbing PII.
 delete from public.contacts where id=eligible_contact;
 select * into r from public.campaign_batch_recipients
   where batch_id=test_batch and id=r.id;
 if r.status<>'excluded' or r.exclusion_reason<>'contact_deleted'
   or r.contact_id is not null or r.recipient_email is not null
   or r.destination_key is not null
   then raise exception 'Queued-contact deletion did not preserve and scrub checkpoint'; end if;
 if (select count(*) from public.campaign_batch_recipients where batch_id=test_batch)<>2
   then raise exception 'Recipient history disappeared on contact deletion'; end if;

 -- Deleting a claimed/in-flight contact must become UNKNOWN, never auto-replayed.
 insert into public.contacts(workspace_id,first_name,last_name,email,source,tags,email_opt_out,sms_opt_out)
 values(ws,'QA','InFlight','qa-kd094-inflight@example.test','qa-kd094-integrity',array['qa-kd094-integ-flight'],false,true)
 returning id into c;
 insert into public.campaign_batches(workspace_id,source_tag,channel)
 values(ws,'qa-kd094-integ-flight','email') returning id into b;
 perform public.prepare_email_campaign_batch(b);
 select * into r from public.claim_email_campaign_recipients(b,1) limit 1;
 if r.contact_id<>c or r.claim_token is null then raise exception 'Test claim failed'; end if;
 delete from public.contacts where id=c;
 select * into r from public.campaign_batch_recipients where id=r.id;
 if r.status<>'unknown' or r.contact_id is not null
   or r.claim_token is not null or r.recipient_email is not null
   then raise exception 'In-flight deletion did not quarantine and scrub'; end if;

 -- Historical provider-accepted checkpoint survives deletion, without email PII.
 insert into public.contacts(workspace_id,first_name,last_name,email,source,tags,email_opt_out,sms_opt_out)
 values(ws,'QA','Accepted','qa-kd094-accepted@example.test','qa-kd094-integrity',array['qa-kd094-integ-sent'],false,true)
 returning id into c;
 insert into public.campaign_batches(workspace_id,source_tag,channel)
 values(ws,'qa-kd094-integ-sent','email') returning id into b;
 perform public.prepare_email_campaign_batch(b);
 select * into r from public.claim_email_campaign_recipients(b,1) limit 1;
 select public.finish_email_campaign_recipient(r.id,r.claim_token,'sent','qa-fake-provider-id') into result;
 if result is distinct from true then raise exception 'Could not record synthetic acceptance'; end if;
 delete from public.contacts where id=c;
 select * into r from public.campaign_batch_recipients where id=r.id;
 if r.status<>'sent' or r.provider_message_id<>'qa-fake-provider-id'
   or r.contact_id is not null or r.recipient_email is not null
   then raise exception 'Accepted checkpoint was lost or retained PII'; end if;
 raise notice 'PASS KD-094 migration 0036: trimmed eligible duplicate ranked, queued/claimed/sent snapshots preserved, PII scrubbed, in-flight quarantined';
end;
$test$;

rollback;

select (select count(*) from public.contacts where source='qa-kd094-integrity') as test_contacts,
       (select count(*) from public.campaign_batches where source_tag like 'qa-kd094-integ-%') as test_batches;
