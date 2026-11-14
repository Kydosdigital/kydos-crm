# KD-093, temporary fail-closed campaign cap guard

**Purpose:** prevent silent partial sends before the durable campaign recipient queue (KD-094, PR #35) replaces the legacy code.

## Root cause

The existing campaign code returns at most 90 email recipients or 100 SMS/WhatsApp recipients and the old immediate and scheduled callers treated that truncated sample as if it represented the entire audience. A 250-person list might send to only 90 and then be recorded as finished.

## Changes in this PR

1. `lib/campaign.ts`: preserve the provider caps but surface an `incomplete` flag when audience completeness cannot be established. Tagged audiences use an exact count and are refused when over 5,000 source contacts. Smart lists are refused when the workspace has more than 5,000 contacts, or when they use engagement-state filters (which currently load only 90 contacts), because `matchList()` currently loads only the first 5,000 workspace records. Database read failures and missing lists also fail closed.
2. `app/actions.ts`: check complete eligible count **before** attempting an immediate send **or** creating a scheduled campaign. If the number of eligible recipients exceeds the available single-send sample, show an explicit error and perform no provider send or scheduling write.
3. `lib/scheduled.ts`: re-evaluate the audience at execution time, so a campaign that was small when scheduled cannot silently send a subset after the audience grows. If the audience exceeds the current cap or cannot be verified, **automatically cancel** the scheduled send, leave sent count at zero and write an activity-log reason. The existing database status check does not support "blocked"; a dedicated status will follow in the queue migration integration.
4. `app/(app)/broadcast/page.tsx`: show the cap warning, identify unverifiable audiences and disable sending/scheduling controls when the displayed selection would be unsafe.

## Safety

This is a **temporary protection**, not completion of KD-093. It intentionally refuses oversized campaigns until PR #35 and the new sender can queue the entire audience with reliable checkpoints. It does not raise provider limits, bypass marketing consent, change database schemas, or trigger any messages while deploying.

No production deployment or real send was performed as part of development.

## Independent code-review remediation, 14 November 2026

Review identified that the previous count guard could still accept a **partially fetched page** as complete. It also found that `matchList()` swallowed database errors, treating unreadable lists as legitimately empty. These would undermine the entire fail-closed objective.

The current branch now:

- Requires exact returned row count to equal the database's exact source count for tagged audiences, not merely a total under 5,000.
- Uses `matchListVerified()` for the legacy smart-list sender. This strict path compares the exact **database-filtered** source count with the returned page length **before** in-memory filters, refuses query errors, and refuses engagement-state lists whose supporting data is capped at 90.
- Retains the previous cap check and server-side preflight before any immediate provider call or schedule insertion.
- Refuses incomplete scheduled jobs before dispatch and records a safety-cancellation reason.

**Evidence classification:** source-level remediation, followed by CI and preview checks. An actual low PostgREST `max_rows` configuration, smart-list database-error injection and staged fake-provider application test have **not yet** been executed. The PR remains under independent review.

## Required acceptance

- For 250 eligible email contacts, direct Send and Schedule requests must both refuse before any provider call or scheduled insert.
- For a previously scheduled campaign whose audience has grown beyond 90, the scheduler must leave all recipients unsent, set status `cancelled` and write a clear safety-stop activity event.
- For audience sizes 90 email / 100 SMS/WhatsApp or below, normal eligible sending behaviour remains intact.
- For smart lists in a workspace with over 5,000 contacts, or tagged campaigns where exact count exceeds the source cap, the preflight must refuse rather than treating the first page as the full audience.
- Re-check roles, consent and workspace filters. Validate using a fake provider on staging only.
- Review the existing lack of per-recipient checkpoints and provider uncertain-acknowledgement recovery in KD-094 before production sends.

## Important limitations

- The scheduled status currently reuses `cancelled` to stop unsafe jobs because the schema has no `blocked` state. The audit activity contains the real reason; any operator retry must deliberately create a new scheduled send after safe batching is released.
- The preflight and later send are not an atomic audience snapshot. Contacts may be added or opt out between those steps. The full queue implementation must snapshot the audience and re-check suppressions immediately before delivery.
- Existing provider send failures below the cap can still leave partial deliveries. That requires KD-094's checkpoint-based sender, not merely this guard.
