-- Fence each Stripe event claim with a token, so only the current claim owner can finalise or release it (KD-163).
alter table stripe_events add column if not exists claim_token uuid;
