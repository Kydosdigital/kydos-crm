-- Staging-only tenant-boundary regression; entire transaction rolled back.
begin;
do $test$
declare
  alpha uuid;
  beta uuid;
  alpha_contact uuid;
  beta_contact uuid;
  batch uuid;
  recipient uuid;
  err text;
  blocked boolean;
begin
  select id into alpha from public.workspaces
    where id='df55bd02-9862-4d69-aa75-fc5ac67389cb'::uuid
      and slug='kydos-qa-alpha-20261114' and agent_mode='off';
  select id into beta from public.workspaces
    where id='cdf44e6c-0ba4-40e8-b900-53fc1c1d455b'::uuid
      and slug='kydos-qa-beta-20261114' and agent_mode='off';
  if alpha is null or beta is null or alpha=beta then
    raise exception 'STAGING ONLY: QA workspace fingerprint mismatch';
  end if;
  select id into alpha_contact from public.contacts
    where workspace_id=alpha and email='qa-alpha-one@example.test'
    and source='qa-synthetic-alpha';
  select id into beta_contact from public.contacts
    where workspace_id=beta and email='qa-beta-one@example.test'
    and source='qa-synthetic-beta';
  if alpha_contact is null or beta_contact is null then
    raise exception 'STAGING ONLY: QA synthetic contacts missing';
  end if;

  insert into public.campaign_batches(workspace_id,source_tag,channel)
    values(alpha,'qa-kd094-tenant-fixture','email')
    returning id into batch;

  blocked := false;
  begin
    insert into public.campaign_batch_recipients
      (batch_id,workspace_id,contact_id,status,recipient_email,destination_key)
      values(batch,alpha,beta_contact,'queued','qa-beta-one@example.test','qa-beta-one@example.test');
  exception when check_violation then
    get stacked diagnostics err = message_text;
    if err='Campaign recipient contact/workspace mismatch' then
      blocked := true;
    else
      raise;
    end if;
  end;
  if not blocked then raise exception 'Cross-tenant contact insertion was allowed'; end if;

  blocked := false;
  begin
    insert into public.campaign_batch_recipients
      (batch_id,workspace_id,contact_id,status,recipient_email,destination_key)
      values(batch,beta,beta_contact,'queued','qa-beta-one@example.test','qa-beta-one@example.test');
  exception when check_violation then
    get stacked diagnostics err = message_text;
    if err='Campaign recipient batch/workspace mismatch' then
      blocked := true;
    else
      raise;
    end if;
  end;
  if not blocked then raise exception 'Cross-tenant batch insertion was allowed'; end if;

  insert into public.campaign_batch_recipients
    (batch_id,workspace_id,contact_id,status,recipient_email,destination_key)
    values(batch,alpha,alpha_contact,'queued','qa-alpha-one@example.test','qa-alpha-one@example.test')
    returning id into recipient;

  blocked := false;
  begin
    update public.campaign_batch_recipients set contact_id=beta_contact
      where id=recipient;
  exception when check_violation then
    get stacked diagnostics err = message_text;
    if err='Campaign recipient contact/workspace mismatch' then blocked:=true;
    else raise; end if;
  end;
  if not blocked then raise exception 'Cross-tenant contact reassignment was allowed'; end if;

  if (select count(*) from public.campaign_batch_recipients
        where id=recipient and contact_id=alpha_contact and workspace_id=alpha)<>1
    then raise exception 'Valid recipient changed after rejected update'; end if;
  raise notice 'PASS KD-094 tenant guard: cross-tenant contact insert, batch insert and update blocked; valid same-tenant row preserved';
end;
$test$;
rollback;
select count(*) as remaining_test_batches
from public.campaign_batches where source_tag='qa-kd094-tenant-fixture';
