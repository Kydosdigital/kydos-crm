# Lean CRM (GHL replacement, pay per usage)

One app, many businesses. Each business is a workspace; every table is scoped by `workspace_id` and protected by row level security.

## What is built (phase 1)

- Contacts with tags, notes, tasks, consent note, opt-out flags
- Pipelines and opportunities (board view, move between stages)
- Unified inbox and per-contact conversation: SMS and WhatsApp (Twilio), email (Resend)
- Inbound SMS/WhatsApp webhook with STOP handling, delivery status callbacks
- Resend webhook: delivered, bounced and complaint handling (bounces auto opt out)
- One-click unsubscribe link and List-Unsubscribe headers on every email
- Automations: triggers (new contact, tag added, form submitted, stage changed) and steps (send email, send SMS, wait, stop if replied, add/remove tag, create task)
- Website form endpoint: `POST /api/forms/<form-name>` with `{"workspace":"<slug>","email":"..."}`
- Usage page: estimated monthly messaging cost per business

## Not built yet (phase 2+)

- Social posting (use Postiz self-hosted or Ayrshare behind a `lib/social.ts` wrapper)
- Calendar booking, landing page builder, reviews requests, Stripe invoicing
- Visual workflow builder (automations are text-defined for now)
- GHL import (export contacts CSV from GHL, import via a small script)
- Client logins (the schema already supports several members per workspace)

## Setup

1. Create a Supabase project (free tier is fine to start). Run `supabase/migrations/0001_init.sql` in the SQL editor.
2. Supabase Auth: add your user (Authentication, Users, Add user).
3. Copy `.env.example` to `.env.local` and fill it in.
4. `npm install && npm run dev`, sign in, then Settings, "Add a business" for each company.
5. Per business in Settings: email sender, SMS sender, address for the email footer.
6. Deploy to Vercel, add the same env vars, set `NEXT_PUBLIC_APP_URL` to the live URL.
7. Twilio: set the number's incoming webhook to `<url>/api/webhooks/twilio`. Resend: add webhook `<url>/api/webhooks/resend`.

### Cron
`vercel.json` runs the automation processor every 5 minutes. Vercel Hobby only allows daily crons, so either use Pro, or call
`GET <url>/api/cron/automations` with header `Authorization: Bearer <CRON_SECRET>` from Supabase pg_cron, cron-job.org or GitHub Actions.

## Compliance checklist (your responsibility once you leave GHL)

- Resend: verify each sending domain, set SPF, DKIM and DMARC. Warm up new domains slowly.
- Twilio: register an alphanumeric sender ID or buy a UK mobile/long number; WhatsApp needs Meta Business approval. Start these first, they take days.
- PECR: only market to people who opted in (or soft opt-in for existing customers). Record how in `consent_note`.
- Keep the business address filled in per workspace.
- Run GHL and this in parallel for a month before cancelling. Export contacts, tags and workflow logic first.

## Rough running costs

Supabase free to £25/m, Vercel free to £16/m, Resend free to £16/m, Twilio about 4 to 5p per UK SMS segment plus number rental. Total typically £0 to £60 a month plus actual message usage, versus £500 for GHL.
