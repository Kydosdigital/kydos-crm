# Kydos CRM operator handbook

Operational guide for authorised Kydos staff. Check the active workspace before changing records or sending communications. Screens and access depend on your workspace role.

## 1. Start a client workspace

1. Open **Settings** and use **Add a business**. If that section is unavailable, ask a workspace administrator.
2. Switch to the new workspace and confirm its name before importing contacts or changing settings.
3. In **Settings**, enter the postal address, alert email, email sender, reply-to, website, logo and signature. Save and use **Email preview** to check the branded layout.
4. Open **Team** and confirm the intended staff have access. Do not share staff credentials with clients.
5. Use **Contacts** and **Import contacts from CSV** for an approved import. Check field mapping, consent and opt-out information before any campaign.
6. Configure the relevant **Pipeline**, **Tasks**, **Forms**, **Templates** and **Automations**. Test using an internal contact and avoid activating campaigns until the full journey has been checked.
7. Confirm the client's onboarding deliverables and commercial scope outside the CRM where the dedicated onboarding checklist/package features are not yet accepted (KD-151 and KD-152).

## 2. Connect and test channels

- **Settings > Connect your tools** shows the workspace-specific endpoint addresses. Copy from the deployed app, not an old document.
- **Settings > Outlook mailbox** provides **Connect Outlook**. Reconnect through the application if authorisation expires; never paste OAuth credentials into tickets.
- For Resend, verify the sender domain and review SPF, DKIM and DMARC with the domain administrator. For Twilio and Cal.com, configure the provider's approved webhook and signing secret using the deployment's secret-management process.
- Open **Integrations** to inspect connection health, then send a single consented test message and verify its state in **Inbox** or the contact conversation. A recorded outgoing message is not by itself proof of provider delivery.
- Check inbound replies and opt-outs using a controlled test. Do not send bulk messages to live customers until the test passes.

## 3. Daily operations

1. Check **Inbox** for new inbound conversations, then **Tasks** for overdue and due work.
2. Review **Pipeline** for opportunities awaiting action and **Content calendar** for pending approvals and publishing dates.
3. Review **Automations** and **Campaigns** before launching any new bulk sends. Check audience, consent, sender, timing and suppression rules.
4. Use **Reports** and **Activity and calls** for context. Reconcile financial figures against **Invoices** rather than treating won-deal value as cash received.
5. Use the workspace selector whenever switching clients. Confirm the active workspace again before sending or editing.

## 4. Failed sends and missing replies

1. Identify the workspace, affected contact, channel, approximate time and any provider message ID. Record only the minimum personal data needed in internal incident tracking.
2. Check **Inbox**, **Activity and calls** and **Integrations** for visible errors or connection issues.
3. In the provider dashboard, check delivery or rejection details and webhook status using authorised access. Distinguish an accepted send request from a delivered message.
4. Verify sender configuration, consent/opt-out, template approval, credits and connection status. Do not disable opt-out safeguards to force a retry.
5. Before retrying, check whether the provider already accepted or delivered the original message. Avoid duplicate sends, especially for scheduled campaigns.
6. If there is no verified safe retry action, escalate to engineering with the timestamp, provider ID, redacted error and expected outcome. Do not manually alter message status in the database.

## 5. Backups and recovery

- **Activity and calls** is the navigation entry for backup-related operational information. Confirm that the expected private Supabase Storage backup exists and is readable, with the correct workspace and date.
- The current main-branch `lib/backup.ts` exports a limited table list and can silently skip failed uploads. KD-195 and KD-197 must be accepted before treating backups as comprehensive and failure-alerted.
- KD-198 proposes `docs/RESTORE_RUNBOOK.md` in a separate PR. Follow that reviewed runbook once merged. A written runbook does not establish that a restoration has passed.
- Only an authorised engineer should conduct a restore, first in an isolated staging environment. Preserve the original backup, verify row counts and relationships, test permissions and communications, and obtain approval before any production recovery.
- Do not restore production data into a shared development environment, and do not apply live Supabase migrations from this handbook. Only Claude handles live migrations under the work split.
- Track the staged restore exercise under KD-199. Until it passes, recovery remains unverified.

## 6. Escalation and evidence

For incidents, capture the workspace slug, feature, observed behaviour, expected behaviour, time in Europe/London, relevant non-sensitive IDs, screenshots with personal data redacted, and provider/CI evidence. Never paste API keys, refresh tokens, payment details or customer exports into GitHub issues. Assign the issue to the responsible owner in the Build Checklist and record acceptance evidence before changing its status.

## Verification still required

This handbook describes navigation and operator checks visible in the main-branch source on 13 November 2026. Real staff onboarding, channel reconnect, safe retry and staged restore must be exercised in a test workspace. Features in unmerged PRs are not assumed live. Review this document whenever navigation, provider integration or backup behaviour changes.
