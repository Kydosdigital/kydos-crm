create table proposals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(18),'hex'),
  title text not null,
  body text not null,
  amount_gbp numeric(12,2),
  status text not null default 'draft' check (status in ('draft','sent','viewed','accepted','declined')),
  viewed_at timestamptz,
  responded_at timestamptz,
  signed_name text,
  signed_ip text,
  decline_reason text,
  created_at timestamptz not null default now()
);
alter table proposals enable row level security;
create policy "proposals member access" on proposals for all using (is_member(workspace_id)) with check (is_member(workspace_id));
