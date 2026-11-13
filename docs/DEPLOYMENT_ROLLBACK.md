# Deployment and incident rollback procedure

This note covers how a release is reverted if it causes a problem in production. It applies to app deploys (Vercel) and database migrations (Supabase). Restoring customer data from a backup is covered separately in the restore runbook (KD-198).

## Owner and approvals

- Owner for releases, incidents and rollbacks: Stephen (Kydos Digital).
- Claude prepares changes and runs checks. Claude does not apply migrations to production, and does not change production settings, without Stephen's approval.
- Anyone rolling back should write down the time, the deployment or migration involved, and the reason, in the build tracker.

## Known-good deployment

1. Every merge to `main` produces a Vercel production deployment. Before merging a risky change, note the current production deployment ID in the PR.
2. To roll back the app, promote the last known-good deployment to production in the Vercel dashboard (instant rollback). Do not revert code on `main` in a hurry if a rollback to an earlier deployment is enough.
3. After a rollback, check sign-in, the dashboard, and the area that broke. Check the runtime logs for errors that continue after the rollback.

## Database migrations

1. Migrations are additive. Do not drop tables, columns or data as part of a rollback.
2. Prefer a forward fix: a new numbered migration in `supabase/migrations/` that corrects the problem, tested on staging first.
3. If a migration must be undone, write the reversing change as a new migration, apply it to staging, and only then ask Stephen to approve production.
4. Confirm the app still works with the database state after any rollback. A rolled-back app must tolerate any columns or tables that a later migration has already added.

## Stopping sends during an incident

If a campaign, automation or message batch is sending the wrong content or to the wrong people, stop it first and investigate second:

1. Pause the affected campaign or automation in the app.
2. Check the delivery log to see which recipients were reached and which were not.
3. Record the stop time and the affected recipients in the tracker before any retry. Never retry a batch without checking which recipients already succeeded.

## Incident record

For each incident, record in the build tracker: what happened, when it started and stopped, the deployment or migration involved, what was rolled back or fixed, and any follow-up task. Do not paste customer contact details, keys, or environment values into the record.
