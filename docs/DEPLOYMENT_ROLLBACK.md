# Deployment and incident rollback procedure

This note covers how a release is reverted if it causes a problem in production. It applies to app deploys (Vercel) and database migrations (Supabase). Restoring customer data from a backup is covered separately in the restore runbook (KD-198).

## Owner and approvals

- Owner for releases, incidents and rollbacks: Stephen (Kydos Digital).
- Claude prepares changes and runs checks. Claude does not apply migrations to production, and does not change production settings, without Stephen's approval.
- Anyone rolling back should write down the time, the deployment or migration involved, and the reason, in the build tracker.

## Known-good deployment

1. Every merge to `main` is expected to produce a Vercel production deployment, but only if the Vercel project's production branch is `main` and automatic production deploys are on. Verify this in the Vercel project settings before relying on it (Stephen to check; the builder does not change project settings).
2. Identify the currently serving production deployment before any promotion: in the Vercel dashboard, open the project's Production environment and note the deployment ID and commit SHA that its domain points to. Record both in the PR or incident record before merging a risky change.
3. To roll back the app, promote the last known-good deployment to production in the Vercel dashboard (instant rollback). Do not revert code on `main` in a hurry if a rollback to an earlier deployment is enough.
4. After a rollback, check sign-in, the dashboard, and the area that broke. Check the runtime logs for errors that continue after the rollback.

## Database migrations

1. Migrations are additive. Do not drop tables, columns or data as part of a rollback.
2. Prefer a forward fix: a new numbered migration in `supabase/migrations/` that corrects the problem, tested on staging first.
3. If a migration must be undone, write the reversing change as a new migration, apply it to staging, and only then ask Stephen to approve production.
4. Confirm the app still works with the database state after any rollback. A rolled-back app must tolerate any columns or tables that a later migration has already added.

## Stopping sends during an incident

If a campaign, automation or message batch is sending the wrong content or to the wrong people, stop it first and investigate second:

1. Pause the affected campaign or automation in the app. Pausing stops new sends only. It does not cancel messages already queued in the app or accepted by a provider.
2. Check the app's queue for any jobs still pending for that campaign or automation, and cancel them if the app allows it.
3. Check the provider side (Resend for email, Twilio for SMS and WhatsApp, Meta for WhatsApp templates) for messages accepted but not yet delivered, and cancel any that the provider still allows to be cancelled. Where a provider cannot cancel, record the count and escalate.
4. Escalation: if sends continue after steps 1 to 3, Stephen is the escalation owner. Contact the provider's support and treat the incident as live until the send count stops rising.
5. Check the delivery log to see which recipients were reached and which were not.
6. Record the stop time and the affected recipients in the tracker before any retry. Never retry a batch without checking which recipients already succeeded.

## Permissions and rehearsal

- Only Stephen holds the production Vercel and Supabase permissions needed for a rollback or a production migration. Confirm this before an incident, not during one.
- A staged rollback rehearsal (promote a previous deployment on a staging project and roll it forward again) has not yet been run. Run it and record the result before this procedure is treated as accepted.

## Incident record

For each incident, record in the build tracker: what happened, when it started and stopped, the deployment or migration involved, what was rolled back or fixed, and any follow-up task. Do not paste customer contact details, keys, or environment values into the record.
