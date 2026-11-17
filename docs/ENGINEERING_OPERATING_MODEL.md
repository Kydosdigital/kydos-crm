# Kydos CRM: engineering operating model

**Effective:** 14 November 2026
**Accountable technical lead:** ChatGPT, acting under the product owner's authority
**Product owner and business approval:** Stephen, Kydos Digital
**Independent quality assurance:** separate Kydos CRM QA scheduled task
**Handover:** [Claude to ChatGPT request](https://github.com/Kydosdigital/kydos-crm/issues/28); answers in the master sheet's `Claude Handover` tab
**Governance upgrade:** [ENG-001](https://github.com/Kydosdigital/kydos-crm/issues/29)

This document supersedes the former Claude-only code ownership split. Claude's former work, PRs, design decisions and contribution history remain part of the engineering record. Existing spreadsheet Owner cells record the historical division of work and must not be rewritten en masse or treated as current engineering permission boundaries.

## 1. Responsibility

ChatGPT owns overall architecture, technical roadmap, source code integration, backlog prioritisation, engineering implementation, security reviews, staging/UAT coordination, CI, monitoring and preparing release recommendations for **all** Kydos CRM workstreams. The independent QA lane must review critical changes separately. The product owner retains control of business scope, spending, privileged access, live payments and customer-impacting production release decisions.

Ownership is operational, not an assertion of company equity, directorship or legal authority. An automation run is a bounded task, not a continuously running developer; do not assume work continues between runs.

## 2. Source of truth

- Master planning and acceptance: [Kydos CRM master build sheet](https://docs.google.com/spreadsheets/d/1izB6yDJSXxBZ6fgMeHJaoiISw3XKJ68V0ojtlQp0Dj4/edit), including Build Checklist, Work Split (historical), Next Steps, UAT Tests and GHL Migration Map.
- Code, review and integration history: this GitHub repository, issue tracker and pull requests.
- Handover decision log: issue #28 and the sheet's Claude Handover tab. Mark unsupported claims as unknown until reproduced.
- Release and incident instructions: `docs/DEPLOYMENT_ROLLBACK.md` and the recovery runbook when merged.

Never mark a checklist item **Done** merely because its source code compiles, a PR is open or a Vercel preview is ready. Require an acceptance check for the behaviour the task claims to implement. Failed, not run and blocked tests remain visible.

## 3. Development and PR rules

1. Read the latest `main`, existing open PRs, CI results, migrations and live checklist first. Avoid implementing work already covered by another open PR.
2. Work on an isolated feature/fix branch, using `chatgpt/KD-xxx-short-name` for checklist tasks or `chatgpt/ENG-xxx-short-name` for governance. Use small PRs with a clear scope, tests, screenshots or API evidence where relevant.
3. Former Claude-only modules (`app/actions.ts`, `lib/automation.ts`, `lib/campaign.ts`, `lib/messaging.ts`, `lib/workspace.ts`, `proxy.ts`, `app/api/**`, migrations) are now within the technical lead's **reviewable scope**, subject to stricter security, blast-radius and integration checks. They are not a shortcut around approvals.
4. Do not commit real credentials, customer contact information or financial data. Server-only secret clients must not appear in browser bundles. Preserve `AGENTS.md` and agreed design system.
5. Check workspace scoping on every query and mutation, and treat service-role access as privileged. Client users remain read-only; never rely on a UI control alone for authorization.
6. New migrations must be append-only, tested in staging and checked against **actual current migration names and applied versions**. Do not reuse an existing number and do not modify an applied file.
7. Make PR dependencies explicit. Merge/rebase parent PRs first, and re-check the final combined diff, not only each separate green PR.
8. Reviewers must check security, data integrity and operational failure handling, not only style. The connected CI runs lint, type generation, TypeScript and production build. Automated behaviour tests should be added as features mature.

## 4. Release gates

**Gate A, code ready for review:** PR, clearly described acceptance criteria, green CI, no leaked secrets, correct base branch and actionable evidence. Code is not Done yet.

**Gate B, staging accepted:** safe dummy data, required roles, cross-workspace checks, meaningful functionality UAT, fail/retry and idempotency tests where appropriate. DB migration ordering, service configuration and upgrade/rollback compatibility must be verified.

**Gate C, production approved:** product-owner approval for any customer-impacting release, payment change, secret/configuration change, production deployment or production schema/data migration. Log the affected systems, known-good deployment, test evidence, current traffic/cron effects and rollback route. No live sends or charge attempts solely to prove tests pass.

**Gate D, completion:** post-deploy smoke check or equivalent verified acceptance, all mandatory UAT evidence recorded and task status updated to Done without erasing history. A documentation-only task may be accepted on documented accuracy without a production functional test, but must not claim to prove a recovery process that has never been rehearsed.

## 5. Current takeover blockers, snapshot 14 November 2026

- Production migration history contains 0001 to 0027; staging contains consolidated earlier migrations plus six Stripe/retainer migrations corresponding to PR #23 (0028 to 0033), not on `main`. **Do not deploy PR #23 or copy those migrations to production without signed replay, concurrency and failure-recovery tests and explicit owner approval.**
- PR #20 and PR #22 both change public form intake. Their combined behaviour must pass paused/unknown-form, abuse and workspace isolation tests before release.
- PR #7 (revenue) and PR #10 (date ranges) change the same report page and may reintroduce double-counting if merged independently.
- PR #4 then #17 (backups), #8 then #19 (post duplication) and #13 then #18 (onboarding) are stacked dependency chains.
- A green typecheck alone does not prove tenant isolation, provider delivery, reliable task execution or restoration. Forty-eight UAT tests and the GHL migration map still require runtime evidence.

These are time-stamped observations, not a permanently authoritative list. Recheck current GitHub and database state before each release.

## 6. Safe execution and reporting

Development automation runs hourly at :00 Europe/London; independent QA runs hourly at :30. Each run reports PR/task identifiers, what was actually done, test evidence, failed or missing checks and the next specific action. Do not claim a task was finished or a provider was contacted unless verified from the action result.

The technical lead maintains one ordered backlog: (1) security and money/data loss; (2) correctness and concurrency; (3) reliable backup and restore; (4) core customer journey and UAT; (5) agency productivity; (6) GHL migration and cutover. The plan may change as real tests reveal defects.

## 7. Where decisions are still required

- User-facing pricing/packages and commissions if brought into CRM billing.
- Whether the project should accept broader live production exposure before P0 UAT.
- Business approval for live provider tests, migration, payment operations, deploys and eventual GHL cancellation.
- Human access needed to create dummy accounts and inspect provider dashboards.

The technical lead should gather evidence and recommend decisions, not convert missing information into invented certainty.
