# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Set Supabase Auth's Site URL before trusting a production signup flow

- **Context**: Any project using Supabase Auth's email-confirmation signup flow, verified during the first post-deploy smoke test.
- **Problem**: Supabase's default Auth Site URL (`http://localhost:3000`) isn't updated automatically on deploy — a real user's confirmation-email link redirects to an unreachable local URL instead of the deployed app. Note: the email is actually confirmed server-side by Supabase before the browser redirect fires, so the account is already active despite the broken redirect — but this is easy to misdiagnose as "signup is broken" instead of "one dashboard setting is stale."
- **Rule**: After the first production deploy of a Supabase Auth project, always set Authentication → URL Configuration → Site URL (and the Redirect URLs allowlist) to the production URL, and verify it by actually running the signup → confirm-email → signin flow with a real inbox before considering the deploy done — not just checking that the build/deploy succeeded.
- **Applies to**: plan, implement, impl-review
