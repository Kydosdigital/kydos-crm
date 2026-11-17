# Staging UAT fixture and access-test procedure

**Environment:** Supabase staging project `psnpdmwkevnxrdrjyiwk`, never production.
**Related:** [ENG-002 issue](https://github.com/Kydosdigital/kydos-crm/issues/31).
**Purpose:** provide two separate workspaces with strictly synthetic contact, pipeline and stage data so P0 role and workspace-isolation tests can run. The fixtures do not constitute an accepted UAT run.

## Current staged fixtures

Run `scripts/staging-uat-seed.sql` only on the staging project. It seeds two workspaces, each with a QA Pipeline, three stages and two synthetic contacts. One contact per workspace has both marketing opt-out flags set, for safe suppression tests.

The SQL creates **no Auth users**, **no workspace memberships**, **no sender addresses**, **no provider API credentials**, and disables digest and AI agent modes. All email addresses end in reserved `.test`, so they are not real inboxes. Never use these fixtures to send live communications or charge real payment methods.

The seed now **fails closed** inside its transaction unless it finds both pre-existing synthetic QA workspace UUIDs, their exact slugs/names and disabled sending settings. This binds the script to the **already-initialised staging project**, not to an ambiguous database name. The precise UUIDs are not credentials. Never run fixtures on production or a project containing real customer data. A new staging database will deliberately fail the guard until it has been separately reviewed and initialised.

The seed verifies the expected two workspaces, one QA pipeline and three QA stages per workspace, two dummy contacts per workspace, no outgoing sender settings, and both opted-out fixtures having email and SMS suppression enabled. These assertions run **before commit** and roll back any inserts if one fails.

**Verification performed by the technical lead:** inspect the exact staging project ID before execution, execute the versioned SQL in staging, run the same SQL again, and check that workspace, pipeline, stage and contact counts have not changed. Separately evaluate the guard's UUID/name/slug predicate on production using a read-only SELECT and confirm it does **not** match. Never try the seed on production even to demonstrate that it fails. This proves a specific safety barrier, not that live data or role-isolation tests are complete.

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

## Executed safeguard and repeatability evidence, 14 November 2026

- Read-only production sentinel query: **0** matching fixture workspace identities, so the guard would abort before any writes. No fixture SQL was executed on production.
- Read-only staging sentinel query: **2** matching fixture workspace identities.
- Ran the new versioned seed **twice** against staging `psnpdmwkevnxrdrjyiwk`; both transactions completed successfully, including in-transaction assertions.
- Subsequent read-only counts: **2** synthetic workspaces, **2** QA pipelines, **6** QA stages, **4** synthetic contacts, **2** contacts with both opt-out flags enabled, **0** Auth users. Counts did not change between runs.
- Outcome: automated seed safety, no duplicate insertion and core data fixtures verified. This is **not** browser/role security UAT and does not permit production promotion or customer invitations.
