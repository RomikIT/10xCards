# Auth Error Handling Hardening — Plan Brief

> Full plan: `context/changes/auth-error-handling-hardening/plan.md`

## What & Why

Wrap the four `supabase.auth.*` call sites (`signup.ts`, `signin.ts`, `signout.ts`, `middleware.ts`) so an unexpected SDK/network exception degrades gracefully instead of hitting Astro's generic 500 page. This closes out finding F1 from the S-01 implementation review — deferred there because that plan explicitly forbade code changes.

## Starting Point

Each of the four call sites already handles Supabase's *expected* error signal (the `{ error }` field returned on failed auth), but none wrap the `await` itself in try/catch. `src/middleware.ts` runs on every request, so an exception there is the highest-blast-radius instance of the gap. No logging convention or error-handling helper exists anywhere in the codebase yet.

## Desired End State

All four call sites catch unexpected exceptions, log them via `console.error` with route context (visible in Cloudflare Workers' log tail), and fall back to exactly the same behavior a handled Supabase error produces today. No route can 500 because of an Auth SDK exception.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Middleware fail mode | Fail closed — `user = null` | Reuses the exact degrade path `middleware.ts` already has for "Supabase not configured"; protected routes stay protected. | Plan |
| Signup/signin catch behavior | Redirect to form with generic message | Matches the existing `?error=` pattern already used for expected Supabase errors — no new UI surface. | Plan |
| Signout catch behavior | Catch, log, still redirect to `/` | Signout must never trap the user — matches today's unconditional redirect. | Plan |
| Architecture | Shared helper in `src/lib/supabase.ts` | No error-handling convention exists yet; one helper keeps the 4 call sites consistent (CLAUDE.md: helpers go in `src/lib/`). | Plan |
| Logging | `console.error` with minimal route context | First logging statement in the repo; Cloudflare Workers surfaces `console.error` in its dashboard for free. | Plan |
| Verification | Code review, not induced-failure testing | No test framework exists; user chose review-only over manually breaking `.dev.vars` to force an exception. | Plan |
| Scope | Try/catch only (F1) — F5/F6 excluded | Those were explicitly skipped as separate, lower-priority findings in the S-01 review. | Plan |
| Error message wording | Same generic text everywhere | Consistent UX; the underlying cause is opaque to the user either way. | Plan |

## Scope

**In scope:** `callSupabaseAuth` helper in `src/lib/supabase.ts`; wiring it into `signup.ts`, `signin.ts`, `signout.ts`, `middleware.ts`.

**Out of scope:** S-01 review findings F5 (untyped error surface) and F6 (`form.get() as string` cast); a dedicated error page; a logging framework; automated tests.

## Architecture / Approach

One helper, `callSupabaseAuth(routeLabel, fn)`, wraps an async Supabase Auth call: on success returns `{ ok: true, value }`, on exception logs via `console.error` and returns `{ ok: false }`. Each call site branches on `ok` and falls back to its existing failure-handling shape (redirect-with-message for signup/signin, silent redirect for signout, `user = null` for middleware) — no new routing or UI is introduced.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Add shared helper, wire it into all four call sites | Try/catch coverage across every Supabase Auth call site, via one shared helper | A typo in the wiring could silently change happy-path behavior — mitigated by the manual happy-path re-test in Success Criteria |

**Prerequisites:** None — pure code change, no new dependencies or config.
**Estimated effort:** Single session, one phase.

## Open Risks & Assumptions

- Verification relies on code review rather than actually forcing a Supabase exception locally — a logic error inside the helper's catch branch itself wouldn't be caught by this plan's manual steps. Accepted per this plan's explicit scoping decision.
- Assumes Cloudflare Workers' `console.error` output is actually visible/retained via the dashboard or `wrangler tail` in this project's deployment — not independently re-verified here (it's standard Workers behavior, not project-specific).

## Success Criteria (Summary)

- `npm run lint` and `npm run build` pass.
- Code review confirms all four call sites route through `callSupabaseAuth` with unchanged happy-path behavior.
- Manual signup → signin → dashboard → signout flow still works end-to-end against `npm run dev`.
