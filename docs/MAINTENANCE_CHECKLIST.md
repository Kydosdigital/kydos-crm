# Weekly CRM maintenance checklist

Purpose: a short weekly check so that failures, payments, backups, integrations and incoming leads are looked at before a client notices a problem. Times are Europe/London.

Each week, the named technical owner works through this list and records the date, observed evidence and unresolved items in the private operational log (see OPERATOR_HANDBOOK.md). Changes needing engineering work must be linked to the existing task or an explicitly approved new task in the Build Checklist. Do not claim a check passed because the underlying page or API exists.

## Named owner

- Accountable technical owner: Kydos CRM CTO (ChatGPT Engineering Lead).
- Human escalation owner: Kydos Digital product owner.
- Weekly operator and backup: assign named people or authorised agents in the private operational log before the run, including coverage for provider-console checks that the technical lane cannot access.

## Checks

1. Failures
   - Review available failed automation runs, campaign delivery statuses, webhook logs and provider dashboards for the past seven days. If a failure view or queue does not yet exist, record the specific monitoring gap as Action; do not assume a dashboard exists.
   - Confirm each failed automation, campaign or webhook has a named owner, or was independently verified successfully recovered. Do not blindly retry uncertain message or payment outcomes.
   - Note any run that stopped part-way and check that the owner was notified.

2. Payments
   - Check Stripe for failed invoices, disputed charges and subscriptions past due.
   - Confirm that duplicate invoice or subscription events are not creating double records.
   - Do not change billing settings from this checklist. Raise anything unusual with Stephen.

3. Backups
   - Confirm the most recent nightly backup completed and the private archive is readable. A backup filename or successful cron HTTP response is insufficient proof.
   - Check actual archive completeness for a synthetic or expressly authorised workspace. Record known storage-object and Auth exclusions. Do not claim recovery is proven until KD-199's isolated restore UAT passes.
   - Record the backup time and size. If the backup failed or is missing, treat it as urgent.

4. Integration health
   - Check the status of the mailbox, WhatsApp, SMS, voice and Meta connections for each active workspace.
   - Confirm that no provider reports missing or expired credentials.
   - Check that no inbound webhook has been rejected in the past week without a logged reason.

5. Incoming leads
   - Confirm that leads from hosted forms and third-party sources reached the intended workspace.
   - Check the failed-lead queue, if one exists, and note anything that needs replay.
   - Confirm that new leads were routed to an owner and not left unassigned.

6. Access and data isolation
   - Confirm there are no unexpected staff, client or service accounts and that recent role changes were approved.
   - Confirm that critical project trackers and exports are not publicly editable; review named editor access. Escalate any anonymous edit permission immediately.
   - Inspect cross-workspace access or permission errors and record unresolved tenant isolation issues. Do not infer UAT pass from green CI.

## Recording the result

- Mark each check as OK, Action, Escalate or Not verified. Include date, named operator, supporting redacted reference and next owner. Only OK with evidence counts as a completed check.
- Escalate anything involving money, data loss, customer messages sent in error, or leaked credentials to Stephen the same day.
- Do not paste API keys, tokens, payment details, customer exports or private Google Sheet URLs into public logs or GitHub.
- This checklist is a manual operating procedure. Its creation or merge is not proof that weekly checks, backups, incident recovery, payment reconciliation or live provider tests have been completed.

## Review

- Review this checklist once a quarter, or after any incident that the checklist did not catch.
