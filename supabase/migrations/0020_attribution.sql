alter table contacts
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text,
  add column if not exists fbclid text,
  add column if not exists gclid text,
  add column if not exists landing_url text;
alter table opportunities add column if not exists lost_reason text;
