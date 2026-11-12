# Work split: ChatGPT (branch) vs Claude (main)

Source of truth: the "Kydos CRM Master Build and Go-Live Checklist" Google Sheet, column I (Owner).
Owners: `ChatGPT (branch)`, `Claude (main)`, `Stephen`, `Stephen + Claude`.

## Rules for ChatGPT
1. Work only on a branch named `chatgpt/KD-xxx-short-name`. Never push to `main`.
2. Open a pull request per task (or small group). CI must be green (`npm ci`, `npx next typegen`, `npx tsc --noEmit`, build).
3. Claude reviews and merges. Do not merge your own PRs.
4. Tasks must be self-contained. If a task needs a change in a shared file, stop and note it in the PR instead.

## Off limits (Claude only)
- `app/actions.ts`, `lib/automation.ts`, `lib/campaign.ts`, `lib/messaging.ts`, `lib/workspace.ts`, `proxy.ts`, `app/api/**`
- Anything touching auth, roles, RLS, billing or webhooks.
- New server actions go in a per-feature file, e.g. `app/(app)/<feature>/actions.ts`, using `requireStaff` or `requireAdmin`.

## Database
- Put migrations in `supabase/migrations/` numbered from `0050` upwards. Only Claude applies migrations to the live database.
- Every new table needs `workspace_id`, RLS enabled, and the standard is_member / is_staff / is_admin policies. Clients stay read-only.

## Other
- No secrets, keys or real customer data in code, commits or PR text.
- Follow `docs/DESIGN_NOTES.md`. British spellings, no em dashes.
- Record evidence (PR link, test notes) in column J of the sheet and set Status to "In review".
