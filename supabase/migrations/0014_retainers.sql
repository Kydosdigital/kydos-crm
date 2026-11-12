create table retainers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  description text not null,
  amount_gbp numeric(12,2) not null,
  status text not null default 'pending' check (status in ('pending','active','past_due','cancelled')),
  checkout_url text,
  stripe_customer_id text,
  stripe_subscription_id text,
  started_at timestamptz,
  last_paid_at timestamptz,
  paid_count int not null default 0,
  created_at timestamptz not null default now()
);
alter table retainers enable row level security;
create policy "retainers member access" on retainers for all using (is_member(workspace_id)) with check (is_member(workspace_id));
