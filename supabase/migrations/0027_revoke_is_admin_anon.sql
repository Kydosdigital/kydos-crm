-- Stop anonymous visitors calling is_admin via the REST API. Policies still need it for signed-in users.
revoke all on function is_admin(uuid) from public, anon;
grant execute on function is_admin(uuid) to authenticated;
