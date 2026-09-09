---
change_id: auth-error-handling-hardening
title: Wrap Supabase Auth calls in try/catch across auth routes and middleware
status: new
created: 2026-09-09
updated: 2026-09-09
archived_at: null
---

## Notes

Wrap the Supabase Auth SDK calls in try/catch — src/pages/api/auth/signup.ts, signin.ts, signout.ts, and src/middleware.ts don't wrap `await supabase.auth.*` calls in try/catch, so an unexpected SDK/network exception propagates unhandled (Astro's generic 500 instead of a friendly redirect; in middleware.ts this affects every request, not just auth pages). Surfaced during the S-01 (account-signup-and-login) implementation review as finding F1 — flagged there rather than fixed inline because that plan explicitly scoped out code changes.
