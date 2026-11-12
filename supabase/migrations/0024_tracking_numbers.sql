create table tracking_numbers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  number text not null unique,
  label text not null,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  created_at timestamptz not null default now()
);
alter table tracking_numbers enable row level security;
create policy "tracking_numbers member access" on tracking_numbers for all using (is_member(workspace_id)) with check (is_member(workspace_id));
alter table call_logs add column if not exists tracking_label text;
