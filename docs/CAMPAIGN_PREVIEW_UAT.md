# KD-097: Non-sending campaign audience preparation

This feature gives agency staff a safe front-end for the email queue prepared in [PR #35](https://github.com/Kydosdigital/kydos-crm/pull/35).

## Access and behaviour

- Route: `/campaign-queue`, visible in the Engage navigation for staff. Existing client navigation hides the route; more importantly, the server page and actions both use `requireStaff()` to deny client-role access.
- The staff user enters a tag from the **active workspace**. The server never accepts a workspace ID from the browser.
- The action creates a `draft` batch with the chosen tag, then calls the already-tested `prepare_email_campaign_batch()` service-role RPC. The SQL counts all matching contacts, captures the same selected/queued/excluded totals used in the 250-contact test, and rejects over 10,000 explicitly.
- Errors do not claim success. A failed preparation attempts to remove its own draft.
- Staff can inspect the latest 40 snapshots and cancel a prepared one. The page never shows customer email addresses.
- There is **no Send button**, API route, cron registration, provider call, or payment step in this feature.

## Staging and QA acceptance

1. Merge dependency: PR #35 first, then rebase this PR on main and rerun CI. The production database currently lacks migration 0035, so merging this page without the schema is not acceptable.
2. Configure a real staging app and safe test accounts first. As of 14 Nov staging Auth users and memberships are zero. Do **not** mark browser tests passed until test identities are available.
3. Alpha staff prepares a tag holding 255 synthetic contacts: the screen must show 255 selected, 250 queued, 5 excluded. Beta staff must not see Alpha batches.
4. Alpha client cannot load the page or invoke either server action. An untrusted workspace ID in FormData must not change the active workspace used by the action.
5. Blank, overlong or control-character tags fail validation without a batch insert.
6. Recreating a preview creates a distinct batch intentionally, while re-preparing the same underlying batch remains idempotent in the RPC.
7. Cancelling an Alpha batch from a Beta account fails; after cancellation the SQL claim RPC yields no rows.
8. Verify no email, SMS, WhatsApp, webhook or billing provider is invoked.
9. Green GitHub CI, Vercel Preview and independent QA, with all results recorded in the master checklist.

## Not yet implemented

This is a **preview and prepare** workflow, not campaign delivery. It does not replace the old 90-recipient sender or implement per-recipient retry/reconciliation UI. Those remain under KD-093/KD-094 and their staged test plans. The active safety-stop PR #36 should be integrated as a separate protection before production sends.
