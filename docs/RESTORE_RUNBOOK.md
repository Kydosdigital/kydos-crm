# Kydos CRM workspace recovery runbook

**Status:** Recovery procedure for a supervised staging rehearsal, not an automated restore command.  
**Owner:** Kydos technical lead, with the product owner's approval for staging or production restoration decisions.  
**Related tasks:** KD-195 (complete exports), KD-197 (backup alerts), KD-199 (isolated restoration test).

## What the backup contains

- **Manual export:** a workspace admin downloads JSON from `/api/backup`.
- **Scheduled export:** `nightlyBackupIfDue()` stores `<workspace-slug>/<YYYY-MM-DD>.json` in the private Supabase Storage bucket named `backups`. The existing cleanup keeps up to 14 daily files per slug.
- **Important dependency:** PR #4 (KD-195) adds workspace settings and 29 workspace-scoped operational tables, with paginated reads and fail-fast behaviour. Files generated **before that PR is merged and deployed** use the older, incomplete 16-table format. Always inspect `format_version`, `exported_at` and table keys before trusting a snapshot.
- **Not in JSON:** Supabase Auth user accounts and MFA, provider API keys, OAuth refresh tokens from `mail_connections`, Supabase Storage media attachments, DNS records, email sender verification, Vercel environment variables, and external systems such as Cal.com or Stripe.
- **Consistency caveat:** this is a sequence of table reads, not an atomic database snapshot. Writes made while exporting could span different points in time. Prefer a quiet maintenance window and verify relationships afterwards.

## Recovery safety rules

1. Do not restore over production while the service is active. Use a **separate Supabase project** with a separate deployment, credentials, storage bucket and sending integrations disabled.
2. Keep the downloaded archive private. It contains personal data, messages and commercial records. Do not attach real backups to GitHub issues, PRs or public logs.
3. Never copy a production service-role key, OAuth refresh token or SMTP/WhatsApp key to a test environment. Use test credentials and suppress all outbound messages, automations, webhooks and cron jobs during import.
4. Preserve source UUIDs and foreign-key relationships in the isolated test database unless a documented remapping is performed for **every** dependant reference. Never fabricate missing contacts, invoices or members merely to make an import complete.
5. Restore credentials and user sessions through proper re-authorisation, not by inserting OAuth secrets or copying auth tables from production.
6. Record recovery operator, archive hash, source export time, destination project and row counts. Do not record personal information in the evidence log.

## Step-by-step staging restoration

### 1. Confirm snapshot and destination

- Obtain a copy of the latest nightly JSON from the private `backups` bucket, or use the manual administrator download. Do not assume the presence of a filename proves the export succeeded.
- Confirm the JSON is readable, includes `exported_at`, and has the expected `workspace` record and table keys from the intended export version. For legacy archives, explicitly list missing tables.
- Calculate a SHA-256 checksum locally and retain it in the private recovery record.
- Confirm the staging project is isolated from production and all external senders and scheduled tasks are disabled.

### 2. Prepare schema and identities

- Provision an **empty** staging database and apply the repository's Supabase migrations in order, using the approved deployment process. Only the accountable technical lead prepares migration changes, and production application requires staged evidence and product-owner approval.
- Recreate the minimal test Auth identities through Supabase Auth's supported administration workflow. Auth identities are **not** part of workspace JSON.
- Build a mapping of source `workspace_members.user_id` to staging Auth IDs. Do not insert membership rows with nonexistent `auth.users` references.
- Verify that RLS is enabled on imported tables and that the staging connection uses an appropriately privileged administrative import role. After import, test with normal owner, member and client sessions.
- Recreate the private `backups` storage bucket and media buckets as appropriate. JSON alone cannot restore their objects.

### 3. Restore rows with foreign-key ordering

Use a reviewed import script or transaction in **staging only** that upserts by original primary keys and rejects missing references. This is an ordering guide, not a ready-to-run SQL script:

1. Workspace configuration record; Auth users must already exist.
2. `workspace_members`, then `pipelines`, `stages`, `contacts` and standalone configuration such as `custom_fields`, `email_templates`, `snippets`, `knowledge_items`, `hosted_forms` and `smart_lists`.
3. `opportunities`, `notes`, `tasks`, `messages`, `bookings`, `calendar_shares`, `content_posts`, `call_logs` and `tracking_numbers`. Check actual foreign keys in the migrated schema before choosing the order for each table.
4. `automations`, then `automation_steps` and `automation_runs`, followed by `scheduled_sends`, `message_events`, `activity_log`, `agent_drafts`, `proposals`, `invoices` and `retainers`, adjusting for foreign keys verified in the destination schema.
5. Re-copy separately protected storage objects if backed up through a second approved process. Validate every linked `media_url` or attachment path.

The import implementation must inspect constraint and foreign-key definitions in the **actual migration set**. Abort rather than disabling constraints or skipping invalid rows. Keep the import repeatable and idempotent for staging retries.

### 4. Reconnect integrations, do not resend history

- Manually re-authorise Outlook and other OAuth providers. `mail_connections` is deliberately excluded because it stores encrypted refresh tokens.
- Restore Vercel secrets and provider settings through their official interfaces, using the appropriate environment, not from Git.
- Keep automation execution, scheduled campaigns, Twilio, WhatsApp, Resend, Stripe and webhook processing disabled until test records are verified. Historic scheduled jobs must not be replayed accidentally.
- Reconnect Cal.com and payment providers separately and check webhooks point to the intended environment.

### 5. Verify integrity and permissions

Record source and restored row counts for **every** exported table, not only contacts. At minimum:

- Workspace configuration, members and roles, contacts and tags, custom fields, pipelines/stages/opportunities and linked contact IDs.
- Tasks, notes, conversations, messages and relevant delivery events.
- Content calendars, client share tokens and approval state; verify assets are actually accessible.
- Proposals, invoices, paid status, retainers and scheduled campaign state.
- Automations, steps, runs and scheduled sends, with execution disabled during test.
- Owner/staff can see their workspace; client users are read-only; no other workspace is visible.
- No FK violations, orphaned rows, duplicate invoice numbers or unintended outbound messages.

Do not mark KD-199 passed until these checks have been executed against a separate staging deployment and evidenced.

### 6. Document outcome and next steps

Save a private recovery report with the archive checksum, format version, expected/actual table counts, failed relationships, skipped storage objects, permissions-test results, defects and actual recovery duration. Mark the rehearsal as **pass** only when data and access checks succeed; otherwise record blockers and repeat after fixing them.

## Known gaps and operational decisions

- **Backup completeness:** KD-195 must be merged and a new export taken; older backups cannot be retroactively upgraded.
- **Failure visibility:** KD-197 is still required so failed exports/uploads trigger an alert, rather than disappearing silently.
- **Full restoration:** This document does not itself implement a restore tool. KD-199 owns the staging recovery rehearsal and evidence.
- **External attachments:** decide and document a separate storage-object backup/restore mechanism before relying on the snapshot for disaster recovery.
- **Retention and legal requirements:** confirm the retention period and secure handling of customer data with the organisation's policy before cutover.
