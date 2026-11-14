-- Track whether a claimed Stripe event finished (KD-163). Existing rows (from before this column) count as processed.
alter table stripe_events add column if not exists status text not null default 'processed' check (status in ('processing', 'processed'));
