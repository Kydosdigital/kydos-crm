-- Record each Stripe webhook event id once so a redelivered event is not processed twice (KD-163).
-- Service role only: RLS is on with no policies, so anon and authenticated users cannot read or write it.
create table if not exists stripe_events (
  event_id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);
alter table stripe_events enable row level security;
