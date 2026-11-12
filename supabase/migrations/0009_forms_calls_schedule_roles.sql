-- Hosted forms, scheduled sends, call log, activity log, snippets, Meta CAPI settings, date and missed-call triggers.
create table hosted_forms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  slug text not null,
  name text not null,
  headline text not null default 'Get in touch',
  intro text,
  button_text text not null default 'Send',
  success_message text not null default 'Thanks, we will be in touch shortly.',
  fields jsonb not null default '[{"key":"first_name","label":"First name","type":"text","required":true},{"key":"email","label":"Email","type":"email","required":true},{"key":"phone","label":"Phone","type":"tel","required":false}]',
  tags text[] not null default '{}',
  consent_text text not null default 'I agree to be contacted by email and WhatsApp about my enquiry.',
  exit_intent boolean not null default false,
  popup_delay_seconds int not null default 0,
  active boolean not null default true,
  views int not null default 0,
  submissions int not null default 0,
  created_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create table scheduled_sends (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  tag text,
  list_id uuid references smart_lists(id) on delete set null,
  subject text not null,
  body text not null,
  send_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','sending','sent','cancelled')),
  sent_count int not null default 0,
  created_at timestamptz not null default now()
);
create index scheduled_due on scheduled_sends (send_at) where status = 'scheduled';

create table call_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  direction text not null check (direction in ('in','out')),
  from_number text,
  to_number text,
  status text,
  duration_seconds int,
  sid text unique,
  created_at timestamptz not null default now()
);

create table activity_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  actor text,
  action text not null,
  entity text,
  entity_id text,
  detail text,
  created_at timestamptz not null default now()
);
create index activity_ws on activity_log (workspace_id, created_at desc);

create table snippets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  body text not null,
  created_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['hosted_forms','scheduled_sends','call_logs','activity_log','snippets'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "%1$s member access" on %1$I for all using (is_member(workspace_id)) with check (is_member(workspace_id))', t);
  end loop;
end $$;

alter table workspaces add column if not exists meta_dataset_id text;
alter table workspaces add column if not exists missed_call_template text;       -- approved WhatsApp template name sent after a missed call
alter table workspaces add column if not exists missed_call_text text;           -- fallback free text if the 24h window is open
alter table tasks add column if not exists assigned_to uuid references auth.users(id) on delete set null;
alter table contacts add column if not exists owner_id uuid references auth.users(id) on delete set null;
alter table automations add column if not exists last_date_check date;

alter table automations drop constraint if exists automations_trigger_type_check;
alter table automations add constraint automations_trigger_type_check check (trigger_type in
  ('contact_created','tag_added','stage_changed','form_submitted','booking_created','booking_cancelled','date_reached','missed_call'));
