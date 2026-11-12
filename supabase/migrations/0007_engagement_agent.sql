-- Engagement events (opens, clicks, reads), knowledge base, agent drafts.
create table message_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  message_id uuid references messages(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  type text not null check (type in ('delivered','opened','clicked','read','bounced','complained')),
  url text,
  machine boolean not null default false,   -- likely a mail-privacy pre-fetch or scanner
  created_at timestamptz not null default now()
);
create index message_events_ws on message_events (workspace_id, created_at desc);
create index message_events_msg on message_events (message_id);
create index message_events_contact on message_events (contact_id, created_at desc);

create table knowledge_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  kind text not null check (kind in ('service','case_study','objection','tone','rule','offer_ladder','faq')),
  title text not null,
  body text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table agent_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  channel text not null check (channel in ('email','whatsapp','sms')),
  subject text,
  body text not null,
  state text,                 -- engagement state when drafted
  hypothesis text,            -- why the agent thinks they behaved this way
  tactic text,                -- chosen approach
  source text not null default 'manual' check (source in ('manual','ai')),
  status text not null default 'pending' check (status in ('pending','approved','rejected','sent','failed')),
  error text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index agent_drafts_ws on agent_drafts (workspace_id, status, created_at desc);

alter table workspaces add column if not exists agent_mode text not null default 'off' check (agent_mode in ('off','approval','auto'));
alter table workspaces add column if not exists last_report_at timestamptz;

do $$ declare t text; begin
  foreach t in array array['message_events','knowledge_items','agent_drafts'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "%1$s member access" on %1$I for all using (is_member(workspace_id)) with check (is_member(workspace_id))', t);
  end loop;
end $$;
