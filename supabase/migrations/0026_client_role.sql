-- Client role: read-only view of their own workspace. Staff (owner, admin, member) keep write access.
alter table workspace_members drop constraint if exists workspace_members_role_check;
alter table workspace_members add constraint workspace_members_role_check check (role in ('owner','admin','member','client'));

create or replace function is_staff(ws uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspace_members where workspace_id = ws and user_id = auth.uid() and role in ('owner','admin','member'));
$$;
revoke execute on function is_staff(uuid) from public, anon;
grant execute on function is_staff(uuid) to authenticated;

-- Every remaining "<table> member access" policy becomes: members and clients read, staff write.
do $$
declare r record;
begin
  for r in select tablename, policyname from pg_policies where schemaname='public' and policyname like '% member access' and cmd='ALL' loop
    execute format('drop policy %I on %I', r.policyname, r.tablename);
    execute format('create policy %I on %I for select using (is_member(workspace_id))', r.tablename||' member read', r.tablename);
    execute format('create policy %I on %I for all using (is_staff(workspace_id)) with check (is_staff(workspace_id))', r.tablename||' staff write', r.tablename);
  end loop;
end $$;
