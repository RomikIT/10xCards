<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Auth Error Handling Hardening Implementation Plan

- **Plan**: context/changes/auth-error-handling-hardening/plan.md
- **Scope**: Phase 1 of 1 (full plan)
- **Date**: 2026-09-09
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — `formData()` parsing isn't wrapped, leaving one path back to the exact failure mode this change targeted

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/signup.ts:5, src/pages/api/auth/signin.ts:5
- **Detail**: `await context.request.formData()` runs before `callSupabaseAuth` is ever invoked and isn't wrapped in any try/catch. A malformed or truncated multipart body throws here, producing exactly the unhandled-exception → Astro generic-500 outcome this change set out to eliminate. This isn't drift — the plan's contract literally only covers "the Supabase Auth SDK call," and the implementation matches that contract exactly — but the plan's own Desired End State language ("no route ever surfaces Astro's generic 500 page because of an Auth SDK exception") reads more broadly than what got closed. Flagging so the narrower scope is a conscious call, not an oversight.
- **Fix**: Wrap `context.request.formData()` in a small try/catch (or reuse `callSupabaseAuth` for it, accepting that its name says "Supabase Auth" for a call that isn't one) in both `signup.ts` and `signin.ts`, returning the same generic-message redirect on failure.
- **Decision**: FIXED — `formData()` wrapped in a local try/catch (not `callSupabaseAuth`, to avoid the naming mismatch) in both `signup.ts` and `signin.ts`; logs via `console.error` and redirects with `GENERIC_AUTH_ERROR_MESSAGE` on failure. `npm run lint` and `npm run build` re-verified passing.

### F2 — `callSupabaseAuth` sits in a file whose prior single responsibility was SSR client construction

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/supabase.ts
- **Detail**: `callSupabaseAuth` + `GENERIC_AUTH_ERROR_MESSAGE` are generic error-handling/logging utilities, distinct in concern from `createClient()`'s SSR-cookie-wiring job, though both are tightly coupled to "calling Supabase Auth." `src/lib/supabase.ts` has no `services/` subfolder structure (CLAUDE.md's feature-module convention applies to grouped folders, which this isn't), so this isn't a violation — just a watch-item as the file grows.
- **Fix**: No action needed now. If more auth-adjacent helpers accumulate, consider extracting to `src/lib/services/auth/` per CLAUDE.md's feature-module convention.
- **Decision**: SKIPPED

### F3 — `console.error` logs the raw thrown error object

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/supabase.ts:36
- **Detail**: `console.error(\`[auth:${routeLabel}]\`, error)` logs whatever `fn()` throws. This is an *unexpected exception*, not the handled `{ error }` Supabase response — email/password are never passed into `callSupabaseAuth` or logged directly, so realistic PII leakage risk is low today. Worth keeping in mind if the Supabase SDK's own thrown error objects are ever found to embed request payloads.
- **Fix**: No action needed now. If SDK error objects are ever found to embed request payloads, log a sanitized subset (`error.name`, `error.message`) instead of the raw object.
- **Decision**: SKIPPED

## Additional verification performed

- **Plan Drift (sub-agent)**: all 5 changed files (`src/lib/supabase.ts`, `signup.ts`, `signin.ts`, `signout.ts`, `middleware.ts`) — MATCH against plan contract, exact signatures/branches/redirect targets. Confirmed the excluded items (`form.get() as string` casts, error-shape passthrough, dedicated error page, logging framework, automated tests) did not creep in. Confirmed `getUser()`'s real return shape (`{ data: { user }, error }`) matches the plan's `result.value.data.user` destructure — not a mismatched assumption.
- **Safety & Quality (sub-agent)**: type safety of `callSupabaseAuth<T>` verified sound (no widening to `any`/`unknown`, narrowing still works at every call site). `middleware.ts`'s fail-safe behavior verified correct for every request, not just `/dashboard` — `next()` is always reached, no new throw path introduced. Import consistency (`@/lib/supabase` alias) verified across all 4 call sites. No hardcoded secrets, no injection risk.
- **Automated success criteria**: `npm run lint` → exit 0 (one expected `no-console` warning in the new helper, consistent with this plan's own logging decision). `npm run build` → succeeded.
- **Manual success criteria**: Progress 1.3/1.4 both `[x]` with commit evidence (`d15ae3b`) — code review and manual signup→signin→dashboard→signout re-test were confirmed by the user during implementation before the phase-end commit.
