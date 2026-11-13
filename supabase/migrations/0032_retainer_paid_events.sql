-- Durable per-event ledger of Stripe invoice.paid events already counted against a retainer (KD-163).
-- The handler inserts (retainer_id, event_id) before incrementing paid_count, so a replayed event cannot count twice,
-- even after other events have moved retainers.last_stripe_event_id on.
-- Service role only: RLS is on with no policies, and anon and authenticated are revoked.
create table if not exists retainer_paid_events (
  retainer_id uuid not null references retainers(id) on delete cascade,
  event_id text not null,
  counted_at timestamptz not null default now(),
  primary key (retainer_id, event_id)
);
alter table retainer_paid_events enable row level security;
revoke all on retainer_paid_events from anon, authenticated;
