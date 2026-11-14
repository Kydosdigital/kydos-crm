-- Count one Stripe invoice.paid event against a retainer, atomically (KD-163).
-- The ledger insert and the paid_count update run in one transaction, so a crash between them cannot lose or double a count.
-- Returns true when this event was counted now, false when it had already been counted.
create or replace function retainer_mark_paid(p_retainer_id uuid, p_event_id text, p_paid_at timestamptz)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  n int;
begin
  insert into retainer_paid_events (retainer_id, event_id)
  values (p_retainer_id, p_event_id)
  on conflict do nothing;
  get diagnostics n = row_count;
  if n = 0 then
    return false;
  end if;
  update retainers
     set status = 'active',
         last_paid_at = p_paid_at,
         paid_count = paid_count + 1,
         last_stripe_event_id = p_event_id
   where id = p_retainer_id;
  return true;
end;
$$;
-- Only the service role may call it.
revoke all on function retainer_mark_paid(uuid, text, timestamptz) from public, anon, authenticated;
