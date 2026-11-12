alter table workspaces add column if not exists notify_email text;

alter table automation_steps drop constraint if exists automation_steps_type_check;
alter table automation_steps add constraint automation_steps_type_check check (type in
  ('send_email','send_sms','add_tag','remove_tag','move_stage','create_task','wait','stop_if_replied',
   'notify','create_opportunity','wait_weekday','enrol'));

create table email_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  subject text not null,
  body text not null,
  created_at timestamptz not null default now()
);
alter table email_templates enable row level security;
create policy "email_templates member access" on email_templates for all using (is_member(workspace_id)) with check (is_member(workspace_id));
