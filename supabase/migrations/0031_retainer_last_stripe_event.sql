-- Record which Stripe event last incremented a retainer's paid_count, so a replayed event cannot increment it twice (KD-163).
alter table retainers add column if not exists last_stripe_event_id text;
