# Work allocation and engineering ownership

**Effective 14 November 2026:** ChatGPT is the accountable technical lead for the entire Kydos CRM, following a product-owner-directed handover from Claude. This document supersedes the earlier Claude-only file ownership split.

The full engineering policy, security and production gates are in [ENGINEERING_OPERATING_MODEL.md](ENGINEERING_OPERATING_MODEL.md). Read it before changing architecture, code, database migrations or deployment settings.

## Records and handover

- Master checklist, acceptance, migration and UAT: https://docs.google.com/spreadsheets/d/1izB6yDJSXxBZ6fgMeHJaoiISw3XKJ68V0ojtlQp0Dj4/edit
- Original Work Split and Owner values represent historical assignments, not a restriction on the current technical lead's implementation scope. Do **not** rewrite historical ownership without preserving evidence.
- Claude's handover questions and missing information: https://github.com/Kydosdigital/kydos-crm/issues/28
- Technical-lead governance upgrade: https://github.com/Kydosdigital/kydos-crm/issues/29

## Build and review

1. All unfinished KD tasks are within ChatGPT's technical planning responsibility, including formerly Claude-owned services, auth, automations, webhooks, integrations, reporting, UI and migrations.
2. Each implementation change must use an isolated `chatgpt/KD-xxx-name` branch and a PR to `main`, unless a stacked PR names its parent explicitly.
3. Independent QA reviews critical releases and conflicts. A green TypeScript check is not equivalent to feature acceptance.
4. Protect production: no untested deployment, live data change, Stripe change, external send or production migration without explicit product-owner approval. Follow staging and rollback gates.
5. Additive migrations need unique unused numbers and staging verification before any production proposal. As of this takeover, PR #23 holds migration files numbered 0028 to 0033, and its staged changes are not deployed to production.
6. Update Build Checklist evidence links without falsely advancing Done. Preserve client read-only roles, cross-workspace isolation, no exposed secrets and British English.

## Current operating roles

- **Engineering implementation and integration:** ChatGPT technical lead, with code reviews.
- **Independent release assurance:** ChatGPT QA lane, separate scheduled run.
- **Business scope, access, production approvals and cutover:** product owner.
- **Claude:** handover source, not the ongoing accountable technical lead unless the product owner later delegates specific tasks.

This file intentionally stays concise. Use the operating model for procedures and review gates.
