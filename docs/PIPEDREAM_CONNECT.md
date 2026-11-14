# Pipedream Connect for Kydos CRM

**Target:** Existing Pipedream project `proj_vosZn53`, environment **production** for the production deployment. This implementation does not create a project, an OAuth client, connected account, or workflow during deployment.

## Scope

- A dedicated **admin-only** page at `/integrations/pipedream`, linked from the CRM integrations page.
- Searchable, paginated **full Pipedream app catalogue** (up to 24 results per page), plus starter examples until OAuth credentials are configured. App slugs are server-verified against the official registry before tokens are generated.
- Pipedream-hosted **Connect Link** for any valid catalogued app in the approved development environment. Connecting an account does not enable data sync or provider actions.
- Connected account metadata shown only in the authorised CRM workspace. The backend never requests third-party account credentials.
- Every external user ID is `kydos_ws_<UUID>` derived from `requireAdmin()` and the active, authenticated workspace, never supplied by browser input. Two CRM workspaces therefore cannot share Pipedream end users by accident.
- The Connect Link token expires in **600 seconds** and is limited to `connect:accounts:read connect:accounts:write`.
- Server OAuth token requests use `connect:tokens:create connect:accounts:read`; OAuth client ID and secret never enter client-side JavaScript.
- No database migration and no migration drift. The service is strictly gated until secrets and feature flag exist.

## Production secrets and activation

The project ID is not a secret, but the OAuth client **secret is**. In Pipedream, open the workspace **API settings** and create or use a client-credentials OAuth client that can access `proj_vosZn53`. Never paste its secret into GitHub, an issue, a chat or a frontend variable.

Add the following Vercel **production** environment variables using protected project settings:

```dotenv
PIPEDREAM_PROJECT_ID=proj_vosZn53
PIPEDREAM_ENVIRONMENT=production
PIPEDREAM_CLIENT_ID=your_private_client_id
PIPEDREAM_CLIENT_SECRET=your_private_client_secret
PIPEDREAM_CONNECT_ENABLED=false
```

The application intentionally refuses to connect when any configuration is absent or when the project ID differs from `proj_vosZn53`. After security review and controlled release verification, set `PIPEDREAM_CONNECT_ENABLED=true` and redeploy the approved commit. No credentials should be copied into staging from production. Staging can use the same Pipedream project in its separate `development` environment, with separate short-lived test account authorisations and staging-only credentials.

## Release checklist

1. Confirm the existing project is owned by Kydos Digital and that production billing/quota consequences are understood. Pipedream may charge for production usage; approve spend separately.
2. Confirm the OAuth client credentials are available in the protected Vercel environment, without displaying them in PR logs.
3. Pass GitHub CI, Vercel preview and independent security QA. The production build remains disabled until its feature flag is approved.
4. With a **synthetic/admin staging account**, verify the hosted OAuth connection for one test account and only to the intended development environment.
5. Verify an Alpha workspace admin cannot see Beta workspace connections. Member and client roles must not access this page or the server action, even by direct URL or POST. Existing staging Auth gap blocks these tests currently.
6. Confirm a malicious client cannot supply a workspace ID, OAuth token or arbitrary redirect URL to the server action. Test that app slugs are strictly validated.
7. Verify successful and failed API responses do not log OAuth client secrets, Pipedream tokens or third-party access tokens.
8. Confirm no background automation, paid provider activity, data import, outbound message or billing action is activated by connecting an account.
9. After approved deployment and credentials are configured, enable the feature flag. Test only an authorised production account after explicit owner consent.
10. Never claim GHL replacement, active sync or 10,000 connected apps from this initial **managed-auth-only** delivery. Future API proxy, trigger and data-sync integrations need their own consent models, audit trails, mapping and tests.

## Important behaviour

- A connection changes authorisation state **in Pipedream**, not any Kydos CRM contact or CRM data.
- The admin may browse the full catalogue. The server validates app slugs, then verifies the app in Pipedream's official registry before generating a Connect token. Connections only authorise the user's account, they do not automatically grant Kydos any application workflow permissions.
- In addition to slug validation, the server checks that the requested app exists in Pipedream. The production Vercel project can only use the Pipedream production environment; the staging Vercel project can only use Pipedream development. Production needs an additional `PIPEDREAM_PRODUCTION_APPROVED=true` safeguard besides the feature flag.
- `listWorkspacePipedreamAccounts` fetches account metadata without `include_credentials` and returns a strict non-secret projection.
- Token and Connect Link URL are transient and not logged or stored in the CRM. Hosted Connect Link redirects to Pipedream; return to this page and refresh to view status.
- API errors are deliberately generic; detailed secrets and upstream responses must not be exposed in the UI.

Docs: https://pipedream.com/docs/connect/quickstart ; https://pipedream.com/docs/connect/managed-auth/quickstart ; https://pipedream.com/docs/connect/managed-auth/connect-link ; https://pipedream.com/docs/connect/api-reference/authentication .


## Free-plan development marketplace

The Pipedream **Free Connect plan** permits feature development and testing, including managed auth and catalogue discovery. It does **not** provide production Connect for real customers. Pipedream development is limited to **10 external user IDs**, each connecting from a browser signed in to pipedream.com, for testing the developer's own accounts.

The Kydos app marketplace in this PR is a **feature preview**, not a deployed customer service:
- Search and browse the provider's official 3,000+ connector catalogue when protected OAuth credentials are configured; page size is 24
- Without credentials, show a clearly marked sample of popular apps rather than claiming an API response
- Use free Pipedream `development` on the Kydos **staging Vercel project**
- Keep the **production** Vercel project flag `PIPEDREAM_CONNECT_ENABLED=false` and never enable production without an approved plan and cost
- Pipedream app discovery requires the OAuth scope `connect:apps:*`, connection tokens require `connect:tokens:create`, and listing account metadata requires `connect:accounts:read`
- Account listing uses `GET /v1/connect/{project_id}/accounts?external_user_id=...&include_credentials=false` and never displays credential fields
- Pipedream's Connect token is valid for 600 seconds (below the four-hour maximum), and its link is never stored

**Staging settings to add via Vercel (no password/secret in GitHub):**
```dotenv
PIPEDREAM_PROJECT_ID=proj_vosZn53
PIPEDREAM_ENVIRONMENT=development
PIPEDREAM_CLIENT_ID=enter_in_protected_vercel_settings
PIPEDREAM_CLIENT_SECRET=enter_in_protected_vercel_settings
PIPEDREAM_CONNECT_ENABLED=false
```
After Auth/tenant UAT and independent QA, `PIPEDREAM_CONNECT_ENABLED` can be set to true **in staging only** for manual connection testing.

The production Vercel project retains `PIPEDREAM_ENVIRONMENT=production`, `PIPEDREAM_CONNECT_ENABLED=false` and requires both an approved paid Pipedream plan and `PIPEDREAM_PRODUCTION_APPROVED=true` to activate after final release approval.

Source: https://pipedream.com/docs/connect/app-discovery ; https://pipedream.com/docs/connect/api-reference/list-apps ; https://pipedream.com/docs/connect/api-reference/list-accounts ; https://pipedream.com/docs/connect/managed-auth/environments ; https://pipedream.com/pricing .
