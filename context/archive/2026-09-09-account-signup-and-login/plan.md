# Account Signup and Login Implementation Plan

## Overview

S-01 ("user can sign up and log in") is already fully implemented in code: signup, signin, signout routes, client-side validated forms, and middleware-enforced route protection all exist. The signup → confirm-email → signin → dashboard → signout flow against the **live production Worker** was already manually exercised end-to-end as part of the `deployment` change (`context/changes/deployment/deployment-plan.md`, Phase 5 and the rename Addendum), including discovering and fixing the exact Supabase Site URL gotcha `context/foundation/lessons.md` warns about. That work happened under a different change ID and the roadmap still lists S-01 as `ready`, not `done`.

This plan closes S-01 by re-confirming the production flow still works today (things may have drifted since that verification — a Worker rename, secret rotation, or a Supabase dashboard setting could have regressed), extending the check to three auth-specific edge cases the prior verification didn't explicitly cover, and fixing inline if anything is actually broken. No new features and no code changes are expected unless re-verification surfaces a regression.

## Current State Analysis

- **Signup**: `src/pages/api/auth/signup.ts` calls `supabase.auth.signUp({ email, password })`, redirects to `/auth/confirm-email` on success or back to `/auth/signup?error=...` on failure.
- **Signin**: `src/pages/api/auth/signin.ts` calls `supabase.auth.signInWithPassword`, redirects to `/` on success or back to `/auth/signin?error=...` on failure.
- **Signout**: `src/pages/api/auth/signout.ts` calls `supabase.auth.signOut()`, redirects to `/`.
- **Forms**: `SignUpForm.tsx` / `SignInForm.tsx` do client-side validation (email format, password ≥ 6 chars, confirm-password match) before submit; server errors render via `ServerError.tsx` from the `?error=` query param — this surfaces Supabase's raw error message verbatim (e.g. "Invalid login credentials", "Email address ... is invalid").
- **Route protection**: `src/middleware.ts` resolves `context.locals.user` on every request and redirects unauthenticated users away from `/dashboard` (the only entry in `PROTECTED_ROUTES`).
- **Prior production verification**: `context/changes/deployment/deployment-plan.md` Phase 5 confirmed the happy path (signup → confirm-email → signin → dashboard → signout) against `https://10x-astro-starter.romanj23-f66.workers.dev/`, found the Site URL was still `http://localhost:3000` and had the user correct it. The Addendum re-ran the same happy-path check against the renamed `https://10xcards.romanj23-f66.workers.dev/` after the Worker rename, confirming it still worked post-rename.
- **Gap**: neither prior verification exercised the three auth-specific edge cases below (wrong password, signin attempt before confirming email, duplicate signup) or recorded results under S-01's own change folder. No automated test suite exists in the repo (no test framework installed) — adding one is explicitly out of scope per this plan's agreed scope.

## Desired End State

The production auth flow is confirmed working today (not just as of the `deployment` change), across the happy path and the three edge cases below, with results recorded under this change's own Manual Verification record. FR-001 and FR-002 are verified as met against the live deployment, not just against `astro dev`. If verification turns up a regression, it is fixed as part of this change before being marked done.

### Key Discoveries:

- The exact re-verification S-01 calls for already happened once, under `context/changes/deployment/deployment-plan.md` — this plan builds on that evidence rather than re-deriving it, and only adds what that pass didn't cover.
- Error messages shown to the user on failed signin/signup are Supabase's own error strings passed through unfiltered (`error.message` in both `signup.ts:16` and `signin.ts:16`) — relevant context for interpreting what the edge-case checks below should expect to see.

## What We're NOT Doing

- No automated test suite (unit/integration/e2e) — none exists in the repo today, and introducing a test framework is a separate scope decision, not part of closing out S-01's existing, already-implemented flow.
- No new auth features (password reset, remember-me, rate limiting beyond Supabase defaults, email enumeration hardening) — not required by FR-001/FR-002 and not flagged as broken.
- No UX/copy changes to the auth forms or pages — out of scope unless re-verification finds something actually broken.
- No changes to `PROTECTED_ROUTES` or middleware logic — not in question here.

## Implementation Approach

Single manual-verification phase against the live deployed Worker (not `astro dev`), covering the happy path plus three edge cases. Any regression found gets fixed inline as part of this phase — this is a verification-and-close-out change, so "verification fails" and "this change is incomplete" are the same condition, not two separate outcomes.

## Phase 1: Re-verify production auth flow and close out S-01

### Overview

Confirm, against the live `*.workers.dev` URL, that signup, email confirmation, signin, protected-route access, and signout all still work, and that the three edge cases below behave sanely (no crash, no silent failure, no enumeration of account existence beyond what Supabase's default config already reveals). Fix inline if broken.

### Changes Required:

No code changes are planned. If re-verification surfaces a regression, fix it inline **only if the fix is config/secret/dashboard-level** (e.g., a stale Supabase Site URL, a misconfigured redirect allowlist, a rotated/missing env var or Worker secret) — matching the one regression type this flow has actually hit before (`context/changes/deployment/deployment-plan.md` Phase 5). **If the regression turns out to require an actual code change** (e.g., a defect in `signup.ts`/`signin.ts`/`middleware.ts`), stop: do not expand this change's scope inline. Instead, record the finding in this plan's Manual Verification results, leave the corresponding checklist item unchecked, and open a new change via `/10x-new` to fix it — S-01 stays blocked on that follow-up change rather than silently absorbing an unbounded code fix.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

**Adaptation (agreed with user, 2026-09-09)**: the checks below are executed as automated HTTP requests against the app running locally (`npm run dev`), not via manual browser testing against the live Cloudflare Worker. `.dev.vars` points to the same real Supabase project as production, so Auth behavior itself (signup, error responses, anti-enumeration) is genuinely exercised — but nothing specific to the deployed Worker (Site URL, Cloudflare secrets, redirect allowlist) is covered this way. That production-specific check is carried forward as its own outstanding item below, not silently dropped.

- Signup reachability (automated, local): `POST /api/auth/signup` with a fresh test email returns a redirect to `/auth/confirm-email`, not an error. Does not cover clicking the confirmation link, signing in, reaching `/dashboard`, or signing out — see the outstanding item below for that.
- Wrong password (automated, local): `POST /api/auth/signin` with a valid, confirmed email and an incorrect password returns a redirect to `/auth/signin?error=...` carrying a clear message, not a crash.
- Signin before confirming email (automated, local): sign up a second fresh test email, then `POST /api/auth/signin` immediately with its credentials, before the confirmation link is ever visited; confirm the response is a clear error redirect, not a silently granted session.
- Duplicate signup (automated, local): `POST /api/auth/signup` again using the email from the signup-reachability check (already registered); confirm the response doesn't crash and doesn't contradict Supabase's default anti-enumeration behavior.
- If any of the above surfaces a regression: if it's config/secret/dashboard-level (stale Site URL, broken redirect allowlist, misconfigured secret), fix it inline and re-run the specific failing check to confirm. If it requires an actual code change, stop, record the finding here unresolved, and open a new change via `/10x-new` instead of fixing inline.
- Delete the test accounts created during local automated verification from the Supabase dashboard (Authentication → Users) once done.
- **Outstanding (not covered by the automated local pass)**: the full production happy-path — signup → confirm-email click → signin → `/dashboard` → signout — and Site URL / redirect-allowlist correctness on the live Worker (`https://10xcards.romanj23-f66.workers.dev/`) still need manual verification before S-01 is fully closed.

**Results (2026-09-09, automated via curl against `npm run dev` on `http://localhost:4322`)**:
- Signup reachability: two fresh test signups (`signup-test-piotrek-20260909-a@gmail.com`, `...-b@gmail.com`) both returned `302` → `/auth/confirm-email`. No crash.
- Wrong password: signin with test email A + wrong password → `302` → `/auth/signin?error=Invalid%20login%20credentials`. Clean error, no crash.
- Signin before confirming email: signin with test email B (never confirmed) + correct password → `302` → `/auth/signin?error=Email%20not%20confirmed`. No session granted, no crash.
- Duplicate signup: re-signing up test email A hit Supabase's per-email cooldown, then (after waiting it out) the project-wide "email rate limit exceeded" — both returned clean error redirects, no crash, no account-existence leak. Did not reach the literal "already registered" response before hitting the rate limit; stopped retrying to avoid burning more of the live Supabase project's email-sending quota. This matches the same "email rate limit exceeded" observation `context/changes/deployment/deployment-plan.md` Phase 5 already recorded for this exact situation.
- No regression found — nothing required a fix.
- User confirmed (2026-09-09): full production happy-path re-tested directly against the live Worker (`https://10xcards.romanj23-f66.workers.dev/`) and passed; the two local test accounts (`signup-test-piotrek-20260909-a@gmail.com`, `...-b@gmail.com`) were deleted from the Supabase dashboard. Site URL / redirect-allowlist correctness is confirmed indirectly: the confirm-email link click (which requires a correct Site URL to land back on the live Worker) succeeded as part of this happy-path pass — the exact failure mode `context/foundation/lessons.md`'s Site URL lesson warns about did not occur.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to close out the change.

---

## Testing Strategy

### Manual Testing Steps:

1. Happy path (signup → confirm-email → signin → dashboard → signout) against the live Worker URL.
2. Wrong-password signin against a confirmed test account.
3. Signin attempt on an unconfirmed account.
4. Duplicate signup against an already-registered, confirmed email.

No automated unit/integration tests are added as part of this plan (see "What We're NOT Doing").

## Performance Considerations

None — no code changes are in scope, and the prior deployment verification already confirmed acceptable Worker behavior (CPU/log cleanliness) for these routes.

## Migration Notes

Not applicable — no schema or data changes.

## References

- Prior production verification: `context/changes/deployment/deployment-plan.md` (Phase 5, Addendum)
- Auth routes: `src/pages/api/auth/signup.ts`, `src/pages/api/auth/signin.ts`, `src/pages/api/auth/signout.ts`
- Auth forms: `src/components/auth/SignUpForm.tsx`, `src/components/auth/SignInForm.tsx`
- Route protection: `src/middleware.ts`
- Recorded gotcha: `context/foundation/lessons.md` ("Set Supabase Auth's Site URL before trusting a production signup flow")

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Re-verify production auth flow and close out S-01

#### Automated

- [x] 1.1 Lint passes: `npm run lint` — 93f5e74
- [x] 1.2 Build succeeds: `npm run build` — 93f5e74

#### Manual

- [x] 1.3 Signup reachability verified locally (automated): signup request redirects to /auth/confirm-email — 93f5e74
- [x] 1.4 Wrong password shows clear error, no crash (automated, local) — 93f5e74
- [x] 1.5 Signin before confirming email behaves sanely (automated, local) — 93f5e74
- [x] 1.6 Duplicate signup attempt doesn't crash; hit Supabase per-email cooldown then project-wide rate limiting before reaching the literal "already registered" response (see Results) — 93f5e74
- [x] 1.7 Any config/secret-level regression found is fixed inline and re-run to confirm; any code-level regression is left unresolved here and handed off to a new change — 93f5e74
- [x] 1.8 Test accounts created during local automated verification are deleted from the Supabase dashboard — 93f5e74
- [x] 1.9 OUTSTANDING: full production happy-path (confirm-email click → signin → dashboard → signout) and Site URL/redirect correctness verified on the live Worker — 93f5e74
