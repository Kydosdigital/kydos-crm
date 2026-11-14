-- Table privileges default to granting anon and authenticated; remove them so only the service role can use stripe_events (KD-163).
revoke all on stripe_events from anon, authenticated;
