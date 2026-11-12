-- Read state for inbound messages. Existing history is treated as already read.
alter table messages add column if not exists read_at timestamptz;
update messages set read_at = created_at where read_at is null;
create index if not exists messages_unread on messages (workspace_id, contact_id) where direction = 'in' and read_at is null;
