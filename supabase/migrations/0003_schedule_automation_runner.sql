-- Runs the automation engine every 5 minutes via Supabase pg_cron + pg_net.
-- The bearer secret lives in Vault (name: crm_cron_secret) and must equal CRON_SECRET in Vercel.
-- The secret value is not stored in this file; create it with:
--   select vault.create_secret('<CRON_SECRET>', 'crm_cron_secret');
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

select cron.schedule(
  'crm-automation-runner',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := 'https://kydos-crm-kydosdigitals-projects.vercel.app/api/cron/automations',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'crm_cron_secret'))
  );
  $$
);
