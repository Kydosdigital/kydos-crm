# KD-AUTH: login link delivery safeguard

## Evidence from production read-only inspection, 14 Nov 2026

- `app/actions.ts requestLink()` previously discarded `sendAuthLink()` results and unconditionally showed `/login?sent=1`, even if Resend had rejected the message.
- Supabase Auth logs showed successful `/admin/generate_link` requests around 17:55, 17:57 and 18:00 UTC. Those prove token generation, **not email delivery**.
- Production has 1 Auth user with 2 workspace memberships, one in the main Kydos workspace with a sender, and one in a test workspace without `email_from`.
- Old `sendAuthLink()` used `.limit(1).maybeSingle()` on unsorted memberships. Depending on the returned membership, it could select a workspace with no sender and silently fail before contacting Resend.
- The separate connected Resend account showed no recent emails and no verified domains, but **it is not verified to be the account behind the production `RESEND_API_KEY`**. Confirm the correct Resend account's sending-domain status before asserting a provider-wide fault.

## Corrective code

- Login/password reset now selects the oldest **authenticated membership workspace with a valid configured email sender**, rather than one arbitrary membership. It never chooses a workspace to which the user does not belong.
- Team invitations explicitly use the admin's selected workspace; when that workspace has no sender, the operation fails closed rather than branding it as another client.
- User lookup is paginated; a missing user never causes the magiclink API to silently create a new account.
- Check for configured Resend key and app URL **before** generating token.
- Only report success internally when Resend returns a message ID; catch network/provider rejection without logging email address, token, link or full provider payload.
- Keep external login responses neutral to prevent account enumeration, with honest guidance and password alternative.

## Required QA and release gates

1. Staging dummy accounts: one membership with sender, one without; request link and confirm a **single** provider-accepted email from the configured workspace. This needs test Auth accounts and a test sending domain.
2. Test no registered user, no membership, no sender, invalid app URL, invalid API key/provider failure, and more than 1,000 users through isolated mocks. Confirm no account enumeration or secret logging.
3. Test admin invitation from a workspace without sender is explicitly rejected, and configured invitations still assign the intended workspace membership.
4. Verify the **actual production Resend account** has `social.kydosdigital.com` verified for sending, and inspect matching transactional logs (do not send a new email without authorisation).
5. Review exact CI and both Vercel previews; independent QA must approve prior to merging into protected production `main`.

No real login email has been sent by this remediation. No database writes or service changes performed.
