# Weekly CRM maintenance checklist

Purpose: a short weekly check so that failures, payments, backups, integrations and incoming leads are looked at before a client notices a problem. Times are Europe/London.

Each week, one named owner works through this list. Record the date, the owner and any findings in the operator log (see OPERATOR_HANDBOOK.md). Anything that needs a code change goes into the Build Checklist as a new row, with the owner set in column I.

## Named owner

- Owner for this week: ____________________
- Backup owner (covers absences): ____________________

## Checks

1. Failures
   - Review the failure dashboard and the automation run log for the past seven days.
   - Confirm each failed automation, campaign or webhook has an owner, or was retried successfully.
   - Note any run that stopped part-way and check that the owner was notified.

2. Payments
   - Check Stripe for failed invoices, disputed charges and subscriptions past due.
   - Confirm that duplicate invoice or subscription events are not creating double records.
   - Do not change billing settings from this checklist. Raise anything unusual with Stephen.

3. Backups
   - Confirm the most recent nightly backup completed and was stored.
   - Check that the backup covers the expected tables for a sample workspace.
   - Record the backup time and size. If the backup failed or is missing, treat it as urgent.

4. Integration health
   - Check the status of the mailbox, WhatsApp, SMS, voice and Meta connections for each active workspace.
   - Confirm that no provider reports missing or expired credentials.
   - Check that no inbound webhook has been rejected in the past week without a logged reason.

5. Incoming leads
   - Confirm that leads from hosted forms and third-party sources reached the intended workspace.
   - Check the failed-lead queue, if one exists, and note anything that needs replay.
   - Confirm that new leads were routed to an owner and not left unassigned.

6. Access
   - Confirm that no unexpected staff or client accounts have been added.
   - Check that recent role changes were approved.

## Recording the result

- Mark each check as OK, Action or Escalate.
- Escalate anything involving money, data loss, customer messages sent in error, or leaked credentials to Stephen the same day.
- Do not paste API keys, tokens, payment details or customer exports into the log or into GitHub.

## Review

- Review this checklist once a quarter, or after any incident that the checklist did not catch.
