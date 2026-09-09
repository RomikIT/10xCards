# Account Signup and Login — Plan Brief

> Full plan: `context/changes/account-signup-and-login/plan.md`

## What & Why

S-01 ("user can sign up and log in", FR-001/FR-002) closes out PRD-refs coverage for auth. The code is already fully implemented; the remaining work is to confirm the production flow still works today and hasn't regressed, then formally close the slice.

## Starting Point

Signup, signin, signout, client-side form validation, and middleware-enforced route protection all exist and work (`src/pages/api/auth/*.ts`, `src/components/auth/*Form.tsx`, `src/middleware.ts`). The exact production re-verification S-01 asks for (signup → confirm-email → signin → dashboard → signout against the live Worker, including fixing a stale Supabase Site URL per `context/foundation/lessons.md`) already happened once under the `deployment` change (`context/changes/deployment/deployment-plan.md`, Phase 5 + rename Addendum) — but under a different change ID, and the roadmap still shows S-01 as `ready`, not `done`.

## Desired End State

The production auth flow is re-confirmed working today, across the happy path plus three edge cases (wrong password, signin before email confirmation, duplicate signup), with results recorded under this change's own plan. Any regression found gets fixed inline before the change is considered complete.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Plan scope | Lightweight re-verification + close-out, no new code | Deployment change already did the heavy lifting; duplicating it burns scarce after-hours capacity | Plan |
| Handling a found regression | Fix inline within this change, not a separate follow-up | For a verification-and-close-out change, "verification fails" and "change incomplete" are the same condition | Plan |
| Edge cases to cover | Wrong password + unconfirmed-email signin (required); duplicate signup (included); expired confirm-link (excluded) | First two are the most common real scenarios; expired-link has low ROI (hard to reproduce on demand) for this change | Plan |
| Evidence location | This change's own `plan.md` Manual Verification | Matches the toolkit convention of one change = one self-contained record | Plan |
| Automated test coverage | Out of scope | No test framework exists in the repo yet; adding one is a separate scope decision, not part of closing an already-implemented flow | Plan |

## Scope

**In scope:**
- Manual re-verification of signup/confirm-email/signin/dashboard/signout against the live production Worker
- Manual verification of 3 edge cases: wrong password, signin before email confirmation, duplicate signup
- Inline fix of any regression found during re-verification
- Roadmap status sync (S-01 → `planning` now; → `done` at archive)

**Out of scope:**
- Automated test suite (unit/integration/e2e) — none exists today
- New auth features: password reset, remember-me, rate limiting, email-enumeration hardening
- UX/copy changes to auth forms/pages unless re-verification finds an actual defect
- Expired-confirmation-link scenario (low ROI, hard to reproduce on demand)

## Architecture / Approach

No architecture changes. Single manual-verification phase against the live `*.workers.dev` URL, reusing the evidence already gathered in `context/changes/deployment/deployment-plan.md` rather than re-deriving it, and extending coverage to the three edge cases that prior pass didn't exercise.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Re-verify production auth flow and close out S-01 | Confirmed-working production signup/login (happy path + 3 edge cases), or an inline fix if something regressed | A regression (e.g., stale Site URL, rotated secret) is found and needs a fix not pre-specified in this plan |

**Prerequisites:** None — all code already exists and is deployed.
**Estimated effort:** ~30-45 minutes of manual testing against the live URL; longer only if a regression needs fixing.

## Open Risks & Assumptions

- Assumes the live Worker (`https://10xcards.romanj23-f66.workers.dev/`) and its Supabase project are still configured the same as when `deployment`'s verification last ran — if infrastructure changed since, re-verification may surface a new regression (handled inline per the plan).
- Assumes Supabase's default anti-enumeration behavior (not revealing whether an email is already registered) is acceptable UX — matches current PRD scope (no explicit requirement either way).

## Success Criteria (Summary)

- A user can sign up, confirm their email, sign in, reach `/dashboard`, and sign out — verified against the live production URL today, not just `astro dev`.
- Wrong password, unconfirmed-email signin, and duplicate signup all behave sanely (clear error or safe redirect, no crash, no silent failure).
- S-01 is accurately reflected as `planning` now in `context/foundation/roadmap.md`, ready to advance to `done` once this plan's manual gate passes.
