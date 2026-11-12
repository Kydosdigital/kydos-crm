-- Bookings, run context, branching steps, custom fields, smart lists, review links, closed_at.
create table bookings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  uid text not null,                       -- Cal.com booking uid
  title text,
  start_time timestamptz not null,
  end_time timestamptz,
  status text not null default 'booked' check (status in ('booked','cancelled','attended','no_show')),
  created_at timestamptz not null default now(),
  unique (workspace_id, uid)
);
create index bookings_contact on bookings (contact_id, start_time desc);

create table custom_fields (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  key text not null,
  label text not null,
  type text not null default 'text' check (type in ('text','number','select','date')),
  options text[] not null default '{}',
  unique (workspace_id, key)
);

create table smart_lists (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  filter jsonb not null default '{}',
  created_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['bookings','custom_fields','smart_lists'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "%1$s member access" on %1$I for all using (is_member(workspace_id)) with check (is_member(workspace_id))', t);
  end loop;
end $$;

alter table automation_runs add column if not exists context jsonb not null default '{}';
alter table automation_runs add column if not exists wait_started_at timestamptz;
alter table workspaces add column if not exists booking_link text;
alter table workspaces add column if not exists review_link text;
alter table opportunities add column if not exists closed_at timestamptz;
update opportunities set closed_at = created_at where status in ('won','lost') and closed_at is null;

alter table automations drop constraint if exists automations_trigger_type_check;
alter table automations add constraint automations_trigger_type_check check (trigger_type in
  ('contact_created','tag_added','stage_changed','form_submitted','booking_created','booking_cancelled'));
alter table automation_steps drop constraint if exists automation_steps_type_check;
alter table automation_steps add constraint automation_steps_type_check check (type in
  ('send_email','send_sms','add_tag','remove_tag','move_stage','create_task','wait','stop_if_replied',
   'notify','create_opportunity','wait_weekday','enrol','send_whatsapp',
   'skip_if','skip_unless','end','wait_until','wait_before','wait_after','webhook'));
