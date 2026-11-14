# Account registration, password login and workspace access

## Purpose
Replace the old `/signup` request-access form with real Supabase email/password registration. Existing password login is the default; one-time magic link and password-reset options remain available but secondary.

## Standard new user journey
1. `/signup`: name, email, password and confirmation (10 to 128 characters); server validation plus honeypot.
2. Call `supabase.auth.signUp` on the server using the existing publishable Supabase client, with display-only `full_name` in user metadata. **Never assign a role from registration fields.**
3. With Supabase email confirmations enabled, show the neutral Check your inbox page. Supabase sends the verification email using its **configured SMTP**. Existing-client existence is not exposed by the UI.
4. Verify email via Supabase and either `/auth/callback?code=...` with PKCE exchange, or the existing two-step `/auth/confirm?token_hash=...&type=email` when the signup email template is configured for token hashes.
5. After verification, `/onboarding` checks membership using the signed-in user's Supabase JWT. A member of a workspace goes straight into CRM; an unassigned account sees simple instructions to have an admin add that email under Team > Invite. There is **no self-assigned team/admin role or automatic access to Kydos Digital**.
6. Returning users enter email and password on `/login`. Magic-link and password reset remain in an optional section.
7. Team admin can invite a registered account's email under Team > Invite; membership is scoped to the admin's current workspace.

## Provider setup required before live signups
- In Supabase **Authentication > Providers > Email**, ensure **Allow new users to sign up** and **Confirm email** are enabled in the relevant environment.
- Set **Authentication > URL Configuration** Site URL to the environment's correct application URL. Allow exactly the HTTPS `/auth/callback` redirect(s) for the relevant environment. Production: `https://kydos-crm.vercel.app/auth/callback`. Staging: `https://kydos-crm-staging.vercel.app/auth/callback`. Do not wildcard third-party domains.
- Configure and verify a **custom SMTP sender** in the relevant Supabase Auth project. Supabase's default SMTP is rate-limited and may not deliver to arbitrary team members. Use a verified owned domain. A Resend API key in Vercel **does not automatically configure Supabase Auth SMTP**.
- For cross-device verification and mail-scanner protection, use the **Supabase Confirm signup email template** link to this app's existing two-step `/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/onboarding`. Verify the template in staging first. If using default Supabase `{{ .ConfirmationURL }}` / PKCE instead, test email link redemption in the same browser that registered.
- Secure production signups against spam using Supabase Auth rate limits, CAPTCHA, and email-confirmation policy. Honeypot alone is not sufficient public-abuse protection.

## Release and QA
- [ ] Latest PR GitHub CI, both previews and review approved.
- [ ] Supabase **staging** email confirmations and SMTP configuration verified, no real customer emails.
- [ ] Staging test account receives confirmation email and can sign in with password.
- [ ] Test wrong password, weak password, mismatched password, unknown user, unconfirmed user, duplicate user, scanner-prefetch and expired link.
- [ ] Test user with no membership sees onboarding; user invited as member/client accesses only its workspace; anonymous user sees only public pages; no privilege elevation, user_metadata is never a role.
- [ ] Test team admin invites an already registered user into its current workspace. No automatic privileges from a matching email domain alone.
- [ ] Run browser UAT with actual Supabase Auth identities; do not claim completion from GitHub build alone.

No database schema migration or live Auth setting change is part of this PR. Production Auth configuration and email delivery must be verified before deploying publicly.
