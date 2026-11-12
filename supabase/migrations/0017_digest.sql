alter table workspaces add column if not exists last_digest_date date;
alter table workspaces add column if not exists daily_digest boolean not null default true;
