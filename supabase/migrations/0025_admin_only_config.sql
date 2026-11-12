-- Role-aware policies: any member can read; only owners and admins can change configuration.
create or replace function is_admin(ws uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspace_members where workspace_id = ws and user_id = auth.uid() and role in ('owner','admin'));
$$;

drop policy if exists "workspaces members update" on workspaces;
create policy "workspaces admins update" on workspaces for update using (is_admin(id)) with check (is_admin(id));

do $$
declare t text;
begin
  foreach t in array array['automations','automation_steps','hosted_forms','custom_fields','tracking_numbers','pipelines','stages'] loop
    execute format('drop policy if exists "%1$s member access" on %1$I', t);
    execute format('drop policy if exists "%1$s members" on %1$I', t);
    execute format('create policy "%1$s member read" on %1$I for select using (is_member(workspace_id))', t);
    execute format('create policy "%1$s admin write" on %1$I for all using (is_admin(workspace_id)) with check (is_admin(workspace_id))', t);
  end loop;
end $$;
