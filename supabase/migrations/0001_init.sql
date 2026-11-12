-- Lean CRM: multi-business schema. Every table is scoped by workspace_id (one workspace per business).
-- Run in the Supabase SQL editor or via `supabase db push`.

create extension if not exists "pgcrypto";

-- ───────────── Workspaces & membership ─────────────
create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  email_from text,          -- e.g. 'Kydos Digital <hello@kydosdigital.com>' (domain verified in Resend)
  sms_from text,            -- Twilio number, alphanumeric sender ID or messaging service SID (MG...)
  whatsapp_from text,       -- 'whatsapp:+44...' once approved
  business_address text,    -- shown in email footers (PECR/GDPR)
  created_at timestamptz not null default now()
);

create table workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','admin','member')),
  primary key (workspace_id, user_id)
);

create or replace function is_member(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspace_members where workspace_id = ws and user_id = auth.uid());
$$;

-- ───────────── CRM ─────────────
create table contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  first_name text,
  last_name text,
  email text,
  phone text,                                  -- E.164
  company text,
  source text,
  tags text[] not null default '{}',
  custom jsonb not null default '{}',
  email_opt_out boolean not null default false,
  sms_opt_out boolean not null default false,
  consent_note text,                           -- how/when consent was given (PECR evidence)
  created_at timestamptz not null default now()
);
create unique index contacts_ws_email on contacts (workspace_id, lower(email)) where email is not null;
create unique index contacts_ws_phone on contacts (workspace_id, phone) where phone is not null;
create index contacts_tags on contacts using gin (tags);

create table pipelines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null
);
create table stages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  pipeline_id uuid not null references pipelines(id) on delete cascade,
  name text not null,
  position int not null default 0
);
create table opportunities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  pipeline_id uuid not null references pipelines(id) on delete cascade,
  stage_id uuid not null references stages(id),
  title text not null,
  value numeric(12,2) not null default 0,
  status text not null default 'open' check (status in ('open','won','lost')),
  created_at timestamptz not null default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  title text not null,
  due_at timestamptz,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create table notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

-- ───────────── Messaging (unified inbox) ─────────────
create table messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  channel text not null check (channel in ('sms','email','whatsapp')),
  direction text not null check (direction in ('in','out')),
  subject text,
  body text not null,
  status text not null default 'queued',       -- queued, sent, delivered, failed, received
  provider_id text,                            -- Twilio SID / Resend id
  error text,
  segments int,                                -- SMS segments, for cost tracking
  created_at timestamptz not null default now()
);
create index messages_contact on messages (contact_id, created_at desc);
create index messages_provider on messages (provider_id);

-- ───────────── Automation ─────────────
create table automations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  trigger_type text not null check (trigger_type in ('contact_created','tag_added','stage_changed','form_submitted')),
  trigger_config jsonb not null default '{}',  -- {"tag":"lead"} or {"stage_id":"..."} or {"form":"contact-us"}
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table automation_steps (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references automations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  position int not null,
  type text not null check (type in ('send_email','send_sms','add_tag','remove_tag','move_stage','create_task','wait','stop_if_replied')),
  config jsonb not null default '{}'           -- wait: {"hours":48}; send_*: {"subject","body"}; add_tag: {"tag"}
);
create table automation_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  automation_id uuid not null references automations(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  step_position int not null default 0,
  next_run_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active','done','stopped','failed')),
  started_at timestamptz not null default now(),
  last_error text
);
create index runs_due on automation_runs (next_run_at) where status = 'active';

-- ───────────── Row level security ─────────────
do $$
declare t text;
begin
  foreach t in array array['contacts','pipelines','stages','opportunities','tasks','notes','messages','automations','automation_steps','automation_runs']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "%1$s member access" on %1$I for all using (is_member(workspace_id)) with check (is_member(workspace_id))', t);
  end loop;
end $$;

alter table workspaces enable row level security;
create policy "workspaces members read" on workspaces for select using (is_member(id));
create policy "workspaces members update" on workspaces for update using (is_member(id));
alter table workspace_members enable row level security;
create policy "members read own" on workspace_members for select using (user_id = auth.uid());

-- Create a workspace and make the caller its owner (used by the app's "new business" action).
create or replace function create_workspace(p_name text, p_slug text) returns uuid
language plpgsql security definer set search_path = public as $$
declare ws uuid; pl uuid;
begin
  insert into workspaces (name, slug) values (p_name, p_slug) returning id into ws;
  insert into workspace_members (workspace_id, user_id, role) values (ws, auth.uid(), 'owner');
  insert into pipelines (workspace_id, name) values (ws, 'Sales') returning id into pl;
  insert into stages (workspace_id, pipeline_id, name, position) values
    (ws, pl, 'New lead', 0), (ws, pl, 'Contacted', 1), (ws, pl, 'Proposal', 2), (ws, pl, 'Won', 3), (ws, pl, 'Lost', 4);
  return ws;
end $$;

-- Only signed-in users may create a workspace
revoke all on function create_workspace(text, text) from public, anon;
grant execute on function create_workspace(text, text) to authenticated;
