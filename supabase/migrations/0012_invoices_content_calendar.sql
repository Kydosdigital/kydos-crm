-- Invoices/estimates with Stripe payment links, content calendar posts and client share links.
-- (Applied to the database via the Supabase MCP; kept here for the record.)
create table invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  number text not null,
  description text not null,
  amount_gbp numeric(12,2) not null,
  kind text not null default 'invoice' check (kind in ('invoice','estimate')),
  status text not null default 'draft' check (status in ('draft','sent','paid','void')),
  pay_url text,
  stripe_session_id text,
  due_date date,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, number)
);
create table content_posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  client text not null,
  platform text not null default 'facebook',
  caption text not null,
  media_url text,
  scheduled_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft','awaiting_approval','approved','changes_requested','published')),
  client_comment text,
  created_at timestamptz not null default now()
);
create table calendar_shares (
  token text primary key default encode(gen_random_bytes(18),'hex'),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  client text not null,
  created_at timestamptz not null default now()
);
do $$ declare t text; begin
  foreach t in array array['invoices','content_posts','calendar_shares'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "%1$s member access" on %1$I for all using (is_member(workspace_id)) with check (is_member(workspace_id))', t);
  end loop;
end $$;
