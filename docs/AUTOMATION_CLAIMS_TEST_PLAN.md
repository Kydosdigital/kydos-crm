# KD-107: Atomic automation step claims, safe staging validation

**Scope:** concurrent scheduler coordination. **Do not deploy this migration or code to production until independently reviewed and approved.**

## Failure found

Previously `processDueRuns()` fetched active, due rows using a normal `SELECT` and ran each step. Two cron workers could read the same row and perform its send, tag or task side effect twice. A client-side in-memory lock is not sufficient because Vercel runs separate processes.

## Change

- Migration `0034_atomic_automation_claims.sql` adds a claim token and lease metadata to `automation_runs`.
- Service-role-only `claim_due_automation_runs` selects eligible active runs using `FOR UPDATE OF r SKIP LOCKED` and atomically assigns a unique ownership token.
- The runner requests **one run per claim** and excludes IDs already handled in the same invocation; no bulk claiming of jobs that might never be processed before a serverless timeout.
- Every completion, stop, wait or failure update verifies the worker's claim token before clearing it.
- Disabled automations cannot be claimed, and the worker checks the current active flag before executing its step.
- Expired claims are **quarantined** as failed, with a warning. They are not automatically replayed because a send might have succeeded immediately before a crash.
- Cron response still returns a numeric processed count; other cron jobs are not changed.

## Required staging-only testing

1. Validate that `0034` is unused in the current staging migration history. Staging currently has PR #23's six changes corresponding to 0028 through 0033. Do not renumber or overwrite applied migrations.
2. Apply only the approved new migration to **staging** `psnpdmwkevnxrdrjyiwk`, never production.
3. Verify functions exist; confirm `anon` and `authenticated` cannot execute either function, and `service_role` can.
4. Create a clearly named synthetic `add_tag` automation with one due run and an existing dummy staging contact; do not configure any email/SMS/WhatsApp, external webhook or billing action.
5. Start two independent database requests for `claim_due_automation_runs(1)` simultaneously. For one due test row, exactly one request may return its ID and token; the second must return no ID.
6. Verify a second claim while token is set returns no row. Release/advance only with the valid token; a stale or different token must not update the row.
7. Verify paused workflow remains unclaimable. Verify run metadata and the next step transition are updated together.
8. Set a synthetic claim's expiry in the past and call `expire_stale_automation_claims()`. It must become `failed` and remain unclaimable, with its error visible.
9. Exercise the application runner in a staging app wired to the staging database: an `add_tag` step should run once even when two cron requests overlap. It must never send a live message or charge a card.
10. Run CI and Vercel preview; test failure and retry paths with mocked provider responses before making any production recommendation. Leave UAT-025 Not run unless the actual two-runner application test is evidenced.

## Dependencies and limitations

- Files numbered `0028` to `0033` are currently reserved by draft Stripe PR #23 and already applied on staging. **Migration 0034 is blocked from production** until that stream is resolved and migration history is reconciled.
- Claude PR #24 (KD-106 failure branching) and PR #26 (KD-114 tenant scope) also change `lib/automation.ts`. Integrate their approved changes into the final branch deliberately. Do not merge conflicting versions in arbitrary order.
- The claim prevents two concurrent schedulers executing the **same currently claimed step**. It does **not** provide cross-provider exactly-once messaging when the provider accepts a request but acknowledgment is lost. KD-108, KD-109 and provider-level idempotency/outbox tests remain essential.
- The ten-minute claim lease is longer than the current cron's 60-second maximum execution window. Expiry indicates a stuck or interrupted job; it must be investigated before re-enrolment or retry.
- No production changes were made while preparing this proposal.

## Release gate

CI green, migration applied in staging, two-worker claim test, application-level overlapping cron test, paused workflow test, stale-claim test, tenant-scoping regression, independent QA, and product-owner release approval. Only then consider the production migration and matching code as one controlled change.

## Staging database evidence, 14 November 2026

The technical lead applied `kd107_atomic_automation_claims_0034` **only** to staging Supabase project `psnpdmwkevnxrdrjyiwk`. Production migration history was read-only and unchanged.

Using a disposable `QA KD-107 Atomic Claim` automation with one `add_tag` step and a synthetic Alpha-workspace contact:

| Test | Observed result |
|---|---|
| Function permissions | `anon` and `authenticated` cannot execute either claim/expiry function; `service_role` can |
| Two independent simultaneous claim requests | Worker 1 received the run ID and token; Worker 2 received no row |
| Reclaim while token held | 0 rows |
| Invalid token tries to update claimed run | 0 rows updated |
| Correct token completes step transition | Exactly one row updated; token cleared; position advanced |
| Workflow paused before claim | 0 rows claimed |
| Expired claim swept | Run marked `failed`; token cleared; manual-review error recorded; 0 rows automatically reclaimed |
| Test cleanup | Test automation, step and run deleted; four original synthetic contacts remain |

**Scope of evidence:** database-level concurrency and permission tests. Independent callers were sent in parallel, but this is not proof of application-level overlapping cron requests. No provider send, webhook, charge, user authentication or production migration was performed. UAT-025 therefore remains Not run.

The application branch still requires independent QA, integration with PR #24 and PR #26, and an actual staging application test before production consideration.
