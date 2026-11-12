alter table workspaces add column if not exists brand_color text default '#1f3a5f';
alter table workspaces add column if not exists logo_url text;
alter table workspaces add column if not exists email_signature text;
alter table workspaces add column if not exists reply_to text;
alter table workspaces add column if not exists website_url text;
