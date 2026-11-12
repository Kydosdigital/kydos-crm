-- Outlook (Microsoft Graph) mailbox connection per workspace. Tokens are AES-GCM encrypted by the app.
-- RLS is enabled with no policies, so only the service role (server code) can read or write it.
create table mail_connections (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  provider text not null default 'microsoft',
  account_email text not null,
  refresh_token_enc text not null,
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);
alter table mail_connections enable row level security;

-- Stops the same Outlook message being stored twice.
create unique index messages_ws_provider_unique on messages (workspace_id, provider_id) where provider_id is not null;
