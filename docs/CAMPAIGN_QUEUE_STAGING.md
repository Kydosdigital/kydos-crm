# KD-094, staging email campaign queue and delivery checkpoints

**Implementation status:** queue foundations implemented and exercised in staging, not integrated with live campaigns.
**Owner:** Kydos CRM engineering technical lead.
**Issue:** [KD-093 / KD-094 campaign safety](https://github.com/Kydosdigital/kydos-crm/issues/34).

## Why we need this

The existing `audience()` function still caps email messages at 90 per invocation, and the scheduled sender may mark that capped subset as if the whole campaign were finished. Simply raising that cap risks serverless timeouts, duplicate sends and wasted provider charges.

This PR adds a separate, **non-sending** email queue foundation. It deliberately does not import `lib/messaging.ts`, change `lib/scheduled.ts`, change `app/actions.ts`, or expose an endpoint that can send.

## New database objects

- `campaign_batches`: workspace-scoped, tag-selected email campaign with immutable prepared snapshot and exact selected/queued/excluded counts.
- `campaign_batch_recipients`: workspace-scoped recipient snapshot, original contact ID, normalised email, exclusion reason, status, claim ownership token, provider reference and error.
- `prepare_email_campaign_batch(batch_id)`: prepares an entire tagged list in one transaction, up to **10,000** selected contacts. Anything larger fails explicitly; it cannot silently truncate. A second call keeps the same immutable audience, rather than recapturing contacts or creating duplicates.
- `claim_email_campaign_recipients(batch_id,limit)`: atomically claims at most 20 queued recipients using PostgreSQL `FOR UPDATE SKIP LOCKED`. **Claiming does not send**.
- `finish_email_campaign_recipient(recipient_id,token,result,...)`: acknowledges an outcome only with the correct token; repeated completion is refused.
- `quarantine_expired_email_campaign_claims()`: marks expired in-flight attempts as `unknown`, not queued, avoiding accidental resends when a provider may have accepted a request.

Tables have RLS enabled, with no direct anonymous or ordinary authenticated access. All four functions are restricted to service role. Provider sends or financial actions are not part of these functions.

## Staging test, 14 November 2026

**Environment:** `psnpdmwkevnxrdrjyiwk` (Supabase staging, synthetic data only).

Migration `kd094_email_campaign_queue_0035` was applied to staging, **not production**. The exact reproducible test is `scripts/staging-kd094-queue-test.sql`. It has a fail-closed fingerprint for the existing two QA workspaces, creates temporary synthetic records in a transaction and **rolls back every change**.

| Test | Verified result |
|---|---|
| Alpha audience selected | 255 synthetic contacts |
| Eligible queue | **250**, no silent 90-person cap |
| Excluded | 5, including two opt-outs, missing email, invalid email and duplicate normalised destination |
| Other-tenant contact sharing same tag | Not included in Alpha batch |
| Repeated preparation | 255 snapshot rows unchanged |
| Claim token | Wrong token rejected, right token accepted, repeated completion rejected |
| Stale delivery claim | Marked unknown, not automatically retried |
| Claim bound | Maximum 20 recipients per request |
| Repeated bounded processing of the full 250 | **249 fake provider acceptances, 1 intentionally unknown, 0 queued, 0 sending, exactly 250 attempts** |
| Independent simultaneous claim requests for one queued recipient | Worker 1 claimed the row; Worker 2 returned no row |
| Concurrent test cleanup | One-off batch, recipient and test contact all removed after simulated acknowledgement |
| Cancelled batch | Further claims refused |
| Database access | `anon` and `authenticated` have no table read or function execution; service role allowed |
| Cleanup after test | 0 synthetic test contacts, 0 campaign batches and 0 campaign recipients persisted |

A second, expanded rollback-only run also consumed all 250 eligible recipients through repeated maximum-20 claims, recording 249 synthetic successful acknowledgements and one intentionally unknown delivery. No recipient remained queued or sending. Two separate concurrent database calls for a single queued synthetic recipient returned one claim and one empty result; the disposable claim and contact were then deleted. These are database-level tests, not a real provider-dispatch test.

The SQL assertion block raises an error if any expected result is wrong. The execution returned successfully; read-only post-run queries independently confirmed zero fixture leftovers. **No provider send was attempted.**

## Review remediation: contact history and duplicate ranking, 14 November 2026

Independent review found two defects in the original 0035 migration:

1. `ON DELETE CASCADE` on `campaign_batch_recipients.contact_id` silently removed recipient checkpoints when a contact was deleted or merged.
2. The duplicate-ranking predicate validated untrimmed email addresses, although the final eligibility check used trimmed addresses. An older opted-out duplicate could incorrectly outrank a newer eligible address containing trailing whitespace.

Because **0035 had already been applied to staging**, its migration file was left unchanged. The corrective **0036_campaign_recipient_integrity.sql** migration was applied to staging as `kd094_recipient_integrity_0036`, not production.

The correction changes the contact reference to nullable `ON DELETE SET NULL`. A restricted `BEFORE DELETE` trigger preserves checkpoint rows and clears recipient email and destination data. A queued recipient becomes excluded with reason `contact_deleted`; an in-flight recipient becomes `unknown` to avoid automatically replaying a possibly completed provider action; a previously accepted result remains accepted with its provider reference and no email address. Batch selected/queued/excluded fields remain an immutable **preparation-time snapshot**, not current delivery counters.

The corrected preparation function uses the **same trimmed email validation** for duplicate ranking and eligibility. The 0036 migration is additive; never edit or replay the already applied 0035 migration.

### Regression tests executed in staging

The repeatable, rollback-only `scripts/staging-kd094-integrity-test.sql` passed on staging project `psnpdmwkevnxrdrjyiwk`:

- Older opted-out contact and newer eligible whitespace-variant email: the eligible contact is selected; 2 selected, 1 queued, 1 excluded
- Deleting the queued contact: checkpoint retained, contact reference null, stored recipient email/destination removed, status excluded
- Deleting an in-flight contact: checkpoint retained, claim cleared and status set to unknown, not automatically replayed
- Deleting an already accepted contact: accepted status and synthetic provider reference retained, email address removed
- Test transaction rolled back, independently checked to leave zero `qa-kd094-integrity` contacts and zero test batches
- The original 255-contact / 250-eligible snapshot and claim test was repeated **after** the new migration and passed with zero leftover test contacts, batches or recipients

**Not yet proven:** contact merge end-to-end through the application action, recipient identity/consent at dispatch time, client/browser UAT and external provider delivery. Marketing consent across multiple records sharing an address needs an explicit conservative suppression rule before real sending. No user-facing sending capability is authorised.

## Unfinished integration, mandatory before any live campaign

1. Add a reviewed server-side enqueue flow for staff, with consent confirmation, template preview, exact audience count and cost estimate. Only approved sender identities and workspace destinations should be accepted.
2. Replace both immediate broadcast code (`app/actions.ts`) and scheduled sends (`lib/scheduled.ts`) with the queue, without retaining an older fast path that bypasses per-recipient checkpoints.
3. Support smart-list filters and SMS/WhatsApp in subsequent changes. This migration only supports **tag-based email**. Do not claim full parity with the existing campaign channels.
4. Before sending, recheck contact existence, workspace membership, current email/opt-out flag, suppression lists, batch cancellation and final recipient eligibility. The prepared snapshot does not override a later unsubscribe.
5. Use test provider stubs and bounded throughput. Handle provider acceptance whose acknowledgement is missing as **unknown**, never as a safe blind retry.
6. Add per-recipient delivery statuses and selected/queued/sent/failed/unknown/excluded count reconciliation to the CRM UI. `sent` should mean the provider accepted a message, not that a customer opened or read it.
7. Independently test two overlapping dispatch workers, interrupted jobs, retry handling, abandoned claims, cancellation and full 250-recipient staged dry runs with a fake provider.
8. Keep the old live sending route disabled for any audience that exceeds its cap until the complete queue-based sender has passed review and UAT.

## Migration and release controls

Staging contains the unmerged Stripe migrations corresponding to files 0028 through 0033 and KD-107 migration 0034. The queue schema is **0035**, followed by additive contact-integrity remediation **0036**, separate from the existing scheduled-send table. The production database is still on 0027. Production migration ordering requires resolving PR #23 and PR #33, QA and explicit release approval. Do not independently deploy migration 0035 or assume this PR authorises real sends.

**Acceptance classification:** foundational database snapshot and checkpoint model passed its synthetic staging test. KD-094 overall remains In progress until queue-driven real application execution is tested and reviewed. KD-093 remains In progress, because its old 90-recipient path is not yet replaced.
