# Kydos CRM

A lightweight, multi-workspace CRM for Kydos Digital and the small businesses it supports. Built with Next.js 16, Supabase, Resend and optional integrations for messaging, booking, payments and lead capture.

**Project status: under active development.** The app has many working screens and a deployed backend, but it is **not yet approved for a GoHighLevel (GHL) cutover**. Use the shared master build and go-live checklist (request access from the maintainer) as the source of truth for incomplete work and acceptance testing. This README describes what exists in the code, not a guarantee that every integration has passed a live end-to-end test.

## What the app supports

| Area | Current implementation | Important limitation |
| --- | --- | --- |
| Contacts and lists | Contacts, notes, tags, custom fields, saved filters, CSV import/export, ownership and opt-outs | GHL CSV import only maps basic fields; migration reconciliation remains outstanding |
| Pipeline and tasks | Multiple sales pipelines, drag-and-drop opportunities, task board and assignments | Task editing, reminders and agency-wide work queues are still being improved |
| Inbox | Contact conversations across email, SMS, WhatsApp, Messenger and Instagram | Actual channel connectivity and full inbox synchronisation need individual verification |
| Automations | Trigger-based workflows, presets, branches, waits, message steps, tagging, tasks and owner assignment | Message failures, retries and concurrency need further hardening |
| Campaigns | Email, SMS and WhatsApp broadcasts, scheduling and recurring sends | Recipient caps currently limit each send; do not assume a large audience is fully delivered |
| Lead capture | Hosted and embedded forms, Meta leads, inbound API, Cal.com booking webhooks | Public form abuse protection and per-client integration routing remain on the checklist |
| Client content | Content calendar, private approval links and change requests | No automatic social publishing; post editing and production management are incomplete |
| Commercial | Proposals, estimates, invoices, Stripe checkout and monthly retainers | Billing reconciliation and report definitions need verification |
| Insight | Lead/source reports, activity, engagement reports and daily/weekly summaries | Revenue figures can combine won deals with paid invoices; treat them as provisional |
| Access | Owner, admin, member and read-only client roles, each scoped to a workspace | Client sign-in and cross-workspace isolation still require a real second-user test |
| Recovery | Private storage export and scheduled backup hook | Backup coverage and restore testing are not yet complete |

For a detailed list of open work, consult the shared checklist rather than an old feature roadmap.

## Developer quick start

### Prerequisites

- Node.js **24** and npm, matching the GitHub Actions workflow and Vercel runtime.
- A Supabase project with Auth, PostgreSQL and Storage.
- A Resend account and verified sending domain if you need sign-in invitations or email.
- Optional accounts for Twilio, Meta, Cal.com, Microsoft 365 and Stripe, depending on the features you are testing.

### Install and check

```bash
npm ci
npm run lint
npx next typegen
npx tsc --noEmit
npm run build
npm run dev
```

Open the local Next.js URL shown by the dev server. The GitHub CI workflow runs `npm ci`, `npm run lint`, `npx next typegen`, `npx tsc --noEmit` and `npm run build`. Vercel also builds deployment previews. A passing type-check is not an integration or user-acceptance test.

### Environment variables

Copy the committed `.env.example` to a local `.env.local` and replace **placeholders** with development or staging values from approved secret stores. Never commit real secret values or customer records.

```dotenv
# Core
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_SECRET=YOUR_LONG_RANDOM_SERVER_ONLY_SECRET

# Email and sign-in invitations
RESEND_API_KEY=YOUR_RESEND_KEY
RESEND_WEBHOOK_SECRET=YOUR_RESEND_WEBHOOK_SECRET

# Optional: SMS and voice
TWILIO_ACCOUNT_SID=YOUR_ACCOUNT_SID
TWILIO_AUTH_TOKEN=YOUR_TWILIO_AUTH_TOKEN

# Optional: Meta leads, inbox and WhatsApp Business
META_PAGE_TOKEN=YOUR_PAGE_TOKEN
META_APP_SECRET=YOUR_META_APP_SECRET
META_VERIFY_TOKEN=YOUR_VERIFICATION_TOKEN
META_CAPI_TOKEN=YOUR_META_CONVERSIONS_API_TOKEN
WHATSAPP_TOKEN=YOUR_WHATSAPP_TOKEN
WHATSAPP_PHONE_NUMBER_ID=YOUR_PHONE_NUMBER_ID
WHATSAPP_WABA_ID=YOUR_BUSINESS_ACCOUNT_ID

# Optional: bookings and payments
CALCOM_WEBHOOK_SECRET=YOUR_CALCOM_WEBHOOK_SECRET
STRIPE_SECRET_KEY=YOUR_STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET=YOUR_STRIPE_WEBHOOK_SECRET

# Optional: Microsoft mailbox
MICROSOFT_CLIENT_ID=YOUR_APP_CLIENT_ID
MICROSOFT_CLIENT_SECRET=YOUR_APP_CLIENT_SECRET
MICROSOFT_TENANT_ID=YOUR_TENANT_ID

# Optional: inbound integrations and AI
INBOUND_API_KEY=YOUR_INBOUND_API_KEY
INBOUND_WORKSPACE_SLUG=YOUR_WORKSPACE_SLUG
MCP_API_KEY=YOUR_MCP_API_KEY
MCP_WORKSPACE_SLUG=YOUR_WORKSPACE_SLUG
ANTHROPIC_API_KEY=YOUR_ANTHROPIC_API_KEY
```

These are configuration names, **not** permission to enable every optional service. Only configure and test a channel that the business intends to use. The Supabase service-role key, API keys and webhook secrets must never be exposed to browser code.

### Database setup

The production database has applied migrations through `supabase/migrations/0027_revoke_is_admin_anon.sql`; **0001 alone is no longer sufficient**. Staging additionally holds unmerged migrations that must not be copied blindly to production. For a brand-new, non-production project, review and apply the migrations in order with a migration-aware process, recording which versions were applied.

**Do not blindly rerun SQL migrations in the live database.** In particular, `0003_schedule_automation_runner.sql` contains a deployment-specific cron URL. Check the target environment, Vault secret and schedule before applying it to a fresh project. Only the designated maintainer applies migrations to the live Supabase project.

Before testing the application, configure Supabase Auth, create an owner account, verify the required RLS policies, and confirm the private `backups` bucket exists if you are testing backup behaviour.

### First workspace and invitations

1. Sign in as the owner and create a business under **Settings**.
2. Fill in the business name, alert address, verified sender, reply-to and postal address.
3. Configure only the integrations needed for that business.
4. Invite teammates from **Team**. Roles are owner, admin, member and client.
5. Give each external client a **separate workspace**. A client role is view-only in its own workspace; do not invite a client into the main Kydos Digital agency workspace.
6. Test each new role using a separate real login, including forbidden URL access and direct data access. Menu visibility alone does not prove isolation.

The client role is intended to expose Contacts, Pipeline, Reports, Calendar and Tasks only. A client account can still read data in its own workspace that those reports require.

## Running scheduled jobs

The authenticated endpoint is `GET /api/cron/automations` with the header:

```http
Authorization: Bearer YOUR_CRON_SECRET
```

It runs automation steps, scheduled sends, date triggers, backups, inbox synchronisation, summaries and optional AI work. The endpoint rejects requests when `CRON_SECRET` is absent or incorrect.

**Do not confuse the two schedules in this repository:**

- `vercel.json` contains a daily `0 7 * * *` invocation.
- `supabase/migrations/0003_schedule_automation_runner.sql` configures a **five-minute** Supabase `pg_cron` job using `pg_net` and a Vault secret.

Verify which schedule is active in the target environment, avoid unintended duplicate jobs, and check execution logs. A successful cron HTTP response does not guarantee every individual message was delivered.

The backup hook attempts a private JSON export once per calendar date, at the first eligible invocation after 02:00 London time within the configured 02:00 to 05:59 window. It does not yet provide a validated full-database restore. Treat the corresponding checklist items as open until restore tests and completeness checks pass.

## Integrations and webhook endpoints

Most integrations need both the environment variables above and provider-side configuration. The **Integrations** page provides basic connectivity and recent-activity checks; it is not a substitute for a round-trip test.

| Provider | Endpoint or setup | Notes |
| --- | --- | --- |
| Resend | `/api/webhooks/resend` | Verify sender DNS, signing secret, delivery and bounce handling |
| Twilio SMS | `/api/webhooks/twilio` | Configure inbound and status callbacks |
| Twilio voice | `/api/webhooks/twilio-voice` | Configure the inbound voice webhook and forwarding number |
| Meta | `/api/webhooks/meta` | Facebook Lead Ads, Messenger, Instagram DMs and WhatsApp events; test workspace mapping |
| Cal.com | `/api/webhooks/calcom?ws=WORKSPACE_SLUG` | Booking created, cancelled and rescheduled events |
| Stripe | `/api/webhooks/stripe` | Payment and subscription events; test idempotency and reconciliation |
| Other lead sources | `/api/inbound` | Requires `Authorization: Bearer INBOUND_API_KEY` |
| Hosted forms | `/api/forms/FORM_SLUG` | Include workspace slug in the JSON request; complete abuse safeguards before public launch |
| Microsoft 365 | Settings → Outlook mailbox | Requires Microsoft OAuth application credentials and a live connection |

Some Meta and inbound integrations currently select a single configured workspace. Do not connect multiple client accounts until the per-client routing checklist items are completed and tested.

## Security and operating requirements

- Keep secrets out of Git and avoid including live contact data in PRs or screenshots.
- Use workspace-specific data access and appropriate server-side role checks.
- Keep RLS enabled and test client read-only access using a genuine second user.
- Enable account protections, including MFA and compromised-password protection where available.
- Verify Resend SPF, DKIM and DMARC, sending reputation and opt-out handling.
- Respect UK GDPR and PECR when messaging contacts; record the correct consent or other lawful basis and retain opt-outs.
- Do not rely on private storage exports as a replacement for tested backups and restoration.
- Protect `main` with required CI checks and review before treating the repository as production-ready.

## Working agreement for contributors

The [engineering operating model](docs/ENGINEERING_OPERATING_MODEL.md) and [work allocation rules](docs/WORKSPLIT.md) govern code review, responsibilities and release approval. The historic Work Split sheet records former owners but does not restrict the current technical lead.

- ChatGPT is accountable for architecture, integration and engineering across the CRM. Work on isolated feature branches and request independent QA before release.
- No unapproved production migration, provider send, payment change or customer-impacting deployment.
- Keep environment secrets, customer information and payment data out of commits and PRs.
- Apply new, unique, append-only SQL migrations only after staging review and explicit production approval; never reuse a previously applied number.
- Follow [design notes](docs/DESIGN_NOTES.md), British English and accessible UI conventions.
- Mark work Done only after the relevant acceptance criteria and necessary runtime tests have passed.

## Leaving GoHighLevel

The existing CSV importer recognises names, email, phone, company and tags. It does **not** represent a full GHL migration. Inventory and reconcile contacts, opt-outs, source data, custom fields, notes, opportunities, templates, workflows and any communications that must be retained.

Run GHL and Kydos CRM in parallel, verify deliverability and business workflows, test real client access, and prove backups can be restored. **Do not cancel GHL until the launch-critical checklist and UAT gates are passed.**

Prices and provider limits change. Check current service pricing rather than relying on the old README's cost estimates.
