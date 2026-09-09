# Auth Error Handling Hardening Implementation Plan

## Overview

Wrap the four `supabase.auth.*` call sites (`signup.ts`, `signin.ts`, `signout.ts`, `middleware.ts`) so an unexpected SDK/network exception degrades gracefully instead of propagating into Astro's generic 500 page. Introduce a small shared helper for this, since no error-handling/logging convention exists in the codebase yet and this is the first time more than one call site needs identical treatment.

This closes out finding F1 from the S-01 (`account-signup-and-login`) implementation review, deferred here because that plan explicitly scoped out code changes.

## Current State Analysis

- Four call sites, confirmed exhaustive via `grep -rn "supabase.auth\." src`: `src/pages/api/auth/signup.ts:13` (`signUp`), `src/pages/api/auth/signin.ts:13` (`signInWithPassword`), `src/pages/api/auth/signout.ts:7` (`signOut`), `src/middleware.ts:12` (`getUser`).
- Each already handles Supabase's *expected* failure signal (the `{ error }` field) but none wrap the `await` itself in try/catch — an unexpected thrown exception is unhandled.
- `src/middleware.ts` runs on every request (not just auth routes) and gates `PROTECTED_ROUTES = ["/dashboard"]` by checking `context.locals.user`.
- `src/lib/supabase.ts` already establishes the "degrade gracefully" pattern this plan extends: `createClient()` returns `null` when env vars are missing, and every call site checks for `null` before proceeding.
- No logging convention exists anywhere in `src/` (zero `console.error`/`console.warn`/logger usages found). No test framework is installed (confirmed in `account-signup-and-login`'s plan — "no automated test suite exists in the repo").

## Desired End State

All four call sites catch unexpected exceptions from their Supabase Auth call, log them with minimal route context via `console.error` (visible in Cloudflare Workers' dashboard/tail logs), and degrade to the same fallback behavior a handled Supabase error would produce today — no route ever surfaces Astro's generic 500 page because of an Auth SDK exception.

**Verification**: `npm run lint` and `npm run build` pass; a code-review pass confirms every one of the four call sites routes through the new shared helper and that no call site's happy-path behavior changed.

### Key Discoveries:

- `src/lib/supabase.ts:5-8`'s `if (!SUPABASE_URL || !SUPABASE_KEY) return null` is the existing precedent for "degrade gracefully, don't throw" — the new helper follows the same spirit at the call-site level instead of the client-construction level.
- `middleware.ts:9-16` already has an unconditional `else { context.locals.user = null; }` branch for the `!supabase` case — the exception path reuses this exact same `user = null` outcome, so no new branch shape is needed in `middleware.ts`, only a differently-sourced `null`.

## What We're NOT Doing

- Not touching `src/pages/api/auth/signup.ts:6-7` / `signin.ts:6-7`'s `form.get(...) as string` cast (S-01 review finding F6) — a separate, lower-priority finding that was explicitly skipped, not bundled into this change's scope.
- Not touching the untyped `error.message` passthrough / `{ code, message }` error-shape question (S-01 review finding F5) — same reasoning, separate finding.
- Not building a dedicated error page for system-level failures — the existing `?error=` redirect-to-form pattern (signup/signin) and the existing `user = null` degrade path (middleware) already cover this without new UI surface.
- Not adding a logging framework or structured logging — a single `console.error` call per catch site, consistent with this being the first logging statement in the codebase, not a new logging architecture.
- Not adding automated tests — no test framework exists in this repo (see `account-signup-and-login`'s plan, "What We're NOT Doing"); verification here is code review plus lint/build, matching that plan's precedent.

## Implementation Approach

Add one small helper — `callSupabaseAuth` — to `src/lib/supabase.ts` (co-located with `createClient()`, the file's existing single responsibility: making Supabase Auth calls resilient to missing/failing infrastructure). Each of the four call sites wraps its existing `await supabase.auth.*(...)` call with it. The helper's job is narrow: run the call, catch anything it throws, log it, and hand back a result the call site can branch on — nothing about routing, redirects, or error message wording lives in the helper, since that already differs per call site and per plan the earlier questioning settled it should read the same way it does today (same fallback shape, just now also covering the exception case).

## Phase 1: Add shared helper, wire it into all four call sites

### Overview

Adds `callSupabaseAuth` to `src/lib/supabase.ts` and updates `signup.ts`, `signin.ts`, `signout.ts`, and `middleware.ts` to route their Supabase Auth call through it.

### Changes Required:

#### 1. Shared helper

**File**: `src/lib/supabase.ts`

**Intent**: Provide one place that turns "Supabase Auth call throws" into "Supabase Auth call returns a normalized failure", logging the exception with enough context (which route) to be useful in Cloudflare's log tail, without dictating what each call site does in response.

**Contract**: Export `async function callSupabaseAuth<T>(routeLabel: string, fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }>`. On success, returns `{ ok: true, value: <fn's resolved value> }`. On a thrown exception, calls `console.error(\`[auth:${routeLabel}]\`, error)` and returns `{ ok: false }` — it does not re-throw. Also export the shared fallback message constant `GENERIC_AUTH_ERROR_MESSAGE = "Something went wrong. Please try again."` from the same file, for `signup.ts`/`signin.ts` to use in their `?error=` redirect on the `{ ok: false }` branch.

#### 2. Signup route

**File**: `src/pages/api/auth/signup.ts`

**Intent**: Route the `signUp` call through the helper; on an unexpected exception, redirect back to the signup form with the shared generic message, using the exact same `?error=` redirect shape already used for Supabase's expected errors.

**Contract**: Replace `const { error } = await supabase.auth.signUp({ email, password });` with a call to `callSupabaseAuth("signup", () => supabase.auth.signUp({ email, password }))`. If the result is `{ ok: false }`, `return context.redirect(\`/auth/signup?error=${encodeURIComponent(GENERIC_AUTH_ERROR_MESSAGE)}\`)` before reaching the existing `if (error)` check. If `{ ok: true }`, proceed with the existing `error`-check logic unchanged using `result.value.error`.

#### 3. Signin route

**File**: `src/pages/api/auth/signin.ts`

**Intent**: Same treatment as signup, mirrored for `signInWithPassword`.

**Contract**: Same shape as signup's change: `callSupabaseAuth("signin", () => supabase.auth.signInWithPassword({ email, password }))`, `{ ok: false }` → redirect to `/auth/signin?error=${encodeURIComponent(GENERIC_AUTH_ERROR_MESSAGE)}`, `{ ok: true }` → existing logic against `result.value.error`.

#### 4. Signout route

**File**: `src/pages/api/auth/signout.ts`

**Intent**: Best-effort signout — an exception during `signOut()` must not prevent the redirect to `/` that already happens unconditionally today.

**Contract**: Replace `await supabase.auth.signOut();` with `await callSupabaseAuth("signout", () => supabase.auth.signOut());`. The result (`ok` or not) is not branched on — the function still falls through to the existing unconditional `return context.redirect("/");`. The helper's internal `console.error` is what gives this failure mode visibility; the route itself stays silent to the user, matching the "signout always succeeds from the user's perspective" decision.

#### 5. Middleware

**File**: `src/middleware.ts`

**Intent**: An exception from `getUser()` must fail closed — the request is treated exactly as the existing "Supabase not configured" branch already treats it (`context.locals.user = null`), so `PROTECTED_ROUTES`' existing redirect-to-signin logic (`middleware.ts:18-21`, unchanged) applies uniformly regardless of *why* there's no authenticated user.

**Contract**: Inside the existing `if (supabase) { ... }` branch, replace the direct `const { data: { user } } = await supabase.auth.getUser();` with a call to `callSupabaseAuth("middleware", () => supabase.auth.getUser())`. On `{ ok: true }`, set `context.locals.user = result.value.data.user ?? null` (unchanged from today). On `{ ok: false }`, set `context.locals.user = null` — the same assignment the existing `else` branch already performs for the no-`supabase` case. The rest of the function (the `PROTECTED_ROUTES` check and `next()` call) is untouched.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- Code review confirms all four call sites (`signup.ts`, `signin.ts`, `signout.ts`, `middleware.ts`) route their `supabase.auth.*` call through `callSupabaseAuth`, and that no call site's happy-path (non-exception) behavior changed from what it does today.
- Manually exercise the existing happy paths once each (signup, signin with valid credentials, signout, loading `/dashboard` while signed in and signed out) against `npm run dev` to confirm nothing regressed — this is a sanity check on the refactor, not a test of the exception path itself (exception-path testing was explicitly scoped out in favor of code review, per this plan's questioning).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to close out the change.

---

## Testing Strategy

### Manual Testing Steps:

1. Code review: confirm `callSupabaseAuth` wraps all four call sites and no site's non-exception behavior changed.
2. Manually run through signup → signin → dashboard access → signout once against `npm run dev`, confirming the existing flow still works end-to-end.

No automated unit/integration tests are added — no test framework exists in this repo (see "What We're NOT Doing").

## Performance Considerations

None — the helper adds a try/catch around an already-awaited call; no additional I/O or synchronous work.

## Migration Notes

Not applicable — no schema or data changes, no deployment-order dependency (this is a pure code change, self-contained in one deploy).

## References

- Origin: S-01 implementation review, finding F1 — `context/changes/account-signup-and-login/reviews/impl-review.md`
- Auth routes: `src/pages/api/auth/signup.ts`, `src/pages/api/auth/signin.ts`, `src/pages/api/auth/signout.ts`
- Route protection: `src/middleware.ts`
- Existing degrade-gracefully precedent: `src/lib/supabase.ts:5-8`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Add shared helper, wire it into all four call sites

#### Automated

- [x] 1.1 Lint passes: `npm run lint` — d15ae3b
- [x] 1.2 Build succeeds: `npm run build` — d15ae3b

#### Manual

- [x] 1.3 Code review confirms all four call sites route through `callSupabaseAuth` with unchanged happy-path behavior — d15ae3b
- [x] 1.4 Manual signup → signin → dashboard → signout flow re-tested against `npm run dev`, confirms no regression — d15ae3b
