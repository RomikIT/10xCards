# Authorization and Data-Integrity Coverage — Plan Brief

> Full plan: `context/changes/testing-authorization-data-integrity-coverage/plan.md`
> Research: `context/changes/testing-authorization-data-integrity-coverage/research.md`

## What & Why

Rollout Phase 2 of the test plan. Adds automated tests for two risks that today rely purely on manual verification or unverified assumptions: (1) whether a second authenticated user can access another user's flashcard through the API (Risk #3), and (2) whether grading a flashcard produces a correct, non-corrupted FSRS scheduling state after a real Postgres round-trip (Risk #4).

## Starting Point

`src/pages/api/flashcards/[id].ts`, `[id]/review.ts`, `flashcards.service.ts`, and `review.service.ts` have zero test files. Cross-user protection today rests entirely on RLS policies with no app-level `user_id` filtering as a backstop — meaning a mocked-Supabase test can never actually prove this boundary. `ts-fsrs`'s `TypeConvert.card()` only coerces 3 of the 9 fields persisted in the `flashcards` row; the other 6 pass through the Postgres round-trip unconverted, an assumption never verified in this codebase.

## Desired End State

`npm test` (DB-free) proves the notFound→404 mapping and the rating-validation guard. `npm run test:integration` (requires `npx supabase start`) proves, with two real authenticated users, that cross-user access is genuinely blocked by RLS, and that each of the 4 FSRS ratings produces a plausible state transition with real numeric types surviving the DB round-trip.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Test-user lifecycle | `signUp()` fresh users + `afterAll` cleanup via service-role admin API | Keeps local Supabase clean between runs without narrowing to a single shared account | Plan (user-confirmed) |
| CI scope | Local-only for now; CI wiring deferred to rollout Phase 4 | Keeps this phase's scope to "write the tests," not "wire quality gates" | Plan (user-confirmed) |
| Missing-Supabase behavior | Readable failing test with a clear `npx supabase start` message | Fast, unambiguous diagnosis instead of a cryptic network error | Plan (user-confirmed) |
| FSRS state seeding | Real `UPDATE` to a specific starting state before grading | Reaches edge-case transitions (e.g., relapse to Relearning) without chaining many sequential API calls | Plan (user-confirmed) |
| Rating coverage | All 4 ratings, parametrized | Full coverage of the 4 grading paths with minimal test duplication | Plan (user-confirmed) |
| File organization | Separate `*.integration.test.ts` files alongside existing mocked `*.test.ts` files | Clear visual/glob signal for which tests need Docker, trivial to exclude from `npm test` | Plan (user-confirmed) |
| Risk #3 test layering | Two tiers: mocked-route (404 mapping) + real-DB service-layer (actual RLS boundary) | The mapping and the RLS boundary are different things at different costs; conflating them into one expensive test wastes budget on the cheap half | Research |

## Scope

**In scope:**
- Mocked-tier route tests for `[id].ts` and `[id]/review.ts`
- Shared real-Supabase test-user helper (create, authenticate, clean up)
- `npm test` / `npm run test:integration` script split
- Real-DB integration tests for cross-user IDOR (Risk #3) and FSRS grading (Risk #4)
- `test-plan.md` §6 cookbook update

**Out of scope:**
- CI wiring for the new integration tests (Phase 4's job)
- `GET` list-endpoint tests (no IDOR surface — no `id` param)
- Exact FSRS due-date/stability value assertions (oracle problem)
- Any production code change

## Architecture / Approach

Two test tiers. Tier 1 (mocked, DB-free) covers pure application logic — status-code mapping, input validation — by mocking the service layer, following the existing `generate.test.ts` pattern. Tier 2 (real-DB) covers the actual security and data-integrity boundaries — RLS and the Postgres↔FSRS round-trip — by calling `flashcards.service.ts`/`review.service.ts` directly with real `@supabase/supabase-js` clients authenticated as two distinct real users against local Supabase, bypassing the cookie/route layer entirely since the service functions only need a plain `SupabaseClient`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Mocked-tier route coverage | 404 mapping + rating-guard tests, no new infra | Low — extends an existing, proven pattern |
| 2. Real-Supabase test infrastructure | User helper + script split | Medium — first use of `service_role` key and admin API in this repo |
| 3. Risk #3 real-DB tests | Cross-user IDOR proof at the service layer | Medium — depends on Phase 2 infra working correctly |
| 4. Risk #4 real-DB tests | FSRS transition + numeric-type proof, cookbook update | Medium — seeding specific FSRS states via direct UPDATE is a new technique |

**Prerequisites:** `npx supabase start` running locally for Phases 2-4's automated verification; `npx supabase status` to obtain the local anon and service-role keys.
**Estimated effort:** ~4 sessions, one per phase.

## Open Risks & Assumptions

- Phase 2's `service_role` key handling is the first use of Supabase's admin API in this codebase — no prior pattern to follow, so it's built from scratch and should get extra scrutiny in review.
- These integration tests will not run in CI until rollout Phase 4 — a regression here is only caught by a developer remembering to run `npm run test:integration` locally, until Phase 4 closes that gap.

## Success Criteria (Summary)

- A second authenticated user can be shown, via an automated real-DB test, to never read/update/delete/grade another user's flashcard.
- Each of the 4 FSRS ratings is shown, via an automated real-DB test, to produce a correctly-typed, forward-moving state transition after a real Postgres round-trip.
- `npm test` stays fast and Docker-independent; `npm run test:integration` is the explicit, documented opt-in for the DB-dependent suite.
