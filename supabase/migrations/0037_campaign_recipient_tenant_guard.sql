-- KD-094 staging-first hardening after 0035 and 0036.
-- Enforce tenant integrity even in privileged service-role inserts.
-- No outbound message behaviour or customer data changes in this migration.

create or replace function public.assert_campaign_recipient_workspace()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not exists (
    select 1 from public.campaign_batches b
    where b.id = new.batch_id and b.workspace_id = new.workspace_id
  ) then
    raise exception 'Campaign recipient batch/workspace mismatch'
      using errcode = '23514';
  end if;
  if new.contact_id is not null and not exists (
    select 1 from public.contacts c
    where c.id = new.contact_id and c.workspace_id = new.workspace_id
  ) then
    raise exception 'Campaign recipient contact/workspace mismatch'
      using errcode = '23514';
  end if;
  return new;
end;
$fn$;

drop trigger if exists campaign_recipient_workspace_guard
  on public.campaign_batch_recipients;
create trigger campaign_recipient_workspace_guard
  before insert or update of batch_id, workspace_id, contact_id
  on public.campaign_batch_recipients
  for each row execute function public.assert_campaign_recipient_workspace();

revoke all on function public.assert_campaign_recipient_workspace()
  from public, anon, authenticated;
