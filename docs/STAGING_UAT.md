# Staging UAT fixture and access-test procedure

**Environment:** Supabase staging project `psnpdmwkevnxrdrjyiwk`, never production.
**Related:** [ENG-002 issue](https://github.com/Kydosdigital/kydos-crm/issues/31).
**Purpose:** provide two separate workspaces with strictly synthetic contact, pipeline and stage data so P0 role and workspace-isolation tests can run. The fixtures do not constitute an accepted UAT run.

## Current staged fixtures

Run `scripts/staging-uat-seed.sql` only on the staging project. It seeds two workspaces, each with a QA Pipeline, three stages and two synthetic contacts. One contact per workspace has both marketing opt-out flags set, for safe suppression tests.

The SQL creates **no Auth users**, **no workspace memberships**, **no sender addresses**, **no provider API credentials**, and disables digest and AI agent modes. All email addresses end in reserved `.test`, so they are not real inboxes. Never use these fixtures to send live communications or charge real payment methods.

The seed checks existence before insertion and is safe to repeat. Never run fixtures on production or a project containing real customer data.

## Next required Auth/role setup

The existing staging project currently has no Auth users. Create dedicated dummy test users through the supported Supabase Auth API or the dashboard, **not via SQL inserts into `auth.users`**. Use a test inbox that can receive authentication links and unique staging-only credentials; do not place login secrets in GitHub or the spreadsheet.

Prepare the following distinct roles, backed by real Auth user IDs: Alpha owner, Alpha staff/member, Alpha client, Beta owner, Beta staff/member, Beta client. Insert `workspace_members` rows only through a reviewed staging-only process after those users exist. Verify the client can access only the allowed portal screens.

Until authentication and app configuration are complete, leave UAT-001 to UAT-007 **Not run**. SQL checks alone cannot prove Auth, cookies or RLS for a real user.

## P0 acceptance matrix

1. Positive: Alpha owner and member see Alpha records and can perform authorised operations.
2. Positive: Alpha client sees the five permitted pages but cannot create/update/delete/export or mark inbox messages read.
3. Positive: Beta owner/member/client see only Beta records.
4. Negative: using Beta contact, deal, task and share IDs in Alpha sessions must not read or write Beta data, including through privileged API routes and server actions.
5. Negative: client must not use staff/admin endpoints, storage backup routes or raw direct queries to change restricted data.
6. Negative: an anonymous visitor must not see either workspace's CRM data through the Data API.
7. Verify Auth MFA and role removal where launch requirements demand it.
8. Verify opt-out flags remain respected in any dry-run campaigns; never attempt actual sends without a separately authorised provider sandbox.
9. Record test date, actor role (no passwords), environment ID, observed vs expected result and redacted evidence links in UAT Tests. Only mark Pass after an actual run.

## Notes

- Staging has additional unmerged Stripe/retainer migrations. These are **not** grounds for deploying production migrations; payment tests require a separate Stripe sandbox and approved test plan.
- The SQL does not automatically provision the staging Vercel deployment or its server-side secrets, which must be configured separately and validated before browser UAT.
- Do not delete these workspaces without checking whether QA evidence references them. Clean up deliberately after acceptance.
