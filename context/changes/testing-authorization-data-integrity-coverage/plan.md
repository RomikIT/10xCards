# Authorization and Data-Integrity Coverage — Implementation Plan

## Overview

Rollout Phase 2 of `context/foundation/test-plan.md`. Adds automated test coverage for two risks that today have zero automated tests: cross-user IDOR on flashcard mutation endpoints (Risk #3) and FSRS grading data-integrity through the Postgres round-trip (Risk #4). No production code changes — this phase is test-only, plus one new shared test helper and two new npm scripts.

## Current State Analysis

`src/pages/api/flashcards/[id].ts` (PATCH/DELETE), `src/pages/api/flashcards/[id]/review.ts` (POST grading), `src/lib/services/flashcards.service.ts`, and `src/lib/services/review.service.ts` have **zero test files**. No RLS or FSRS-mapping behavior is protected today beyond manual curl checks documented in `context/archive/2026-09-09-manual-flashcard-management/plan.md`. No real-Supabase test infrastructure exists — `vitest.astro-env-server.stub.ts` already reads `SUPABASE_URL`/`SUPABASE_KEY` straight from `process.env` (no code change needed to point tests at a real instance), but no helper exists to create/authenticate/clean up real test users, and `npm test` (`vitest run`) has no split between DB-free and DB-dependent tests.

## Desired End State

Running `npm test` (no local Supabase required) covers: auth guard, validation, and notFound→404 mapping for `[id].ts` and `[id]/review.ts` via mocked services. Running `npm run test:integration` (requires `npx supabase start`) proves, against real Postgres rows and two real authenticated users: (a) user B can never read/update/delete/grade user A's flashcard, even with the correct id, and (b) grading with each of the 4 ratings produces a plausible FSRS state transition with real numeric types surviving the DB round-trip. `context/foundation/test-plan.md` §6 documents both new cookbook patterns.

**Verification**: `npm run lint`, `npm run build`, `npm test` all pass without Docker running; `npm run test:integration` passes with `npx supabase start` running locally.

### Key Discoveries:

- `src/lib/services/flashcards.service.ts:50-64,67-82` and `src/lib/services/review.service.ts:53-59` — the `notFound: true` signal comes purely from a 0-row Supabase result, never a Postgres error; all three mutating service functions share this shape (research.md, Risk #3).
- `src/pages/api/flashcards/[id].ts:46-57,80-87` and `src/pages/api/flashcards/[id]/review.ts:50-53` — all three routes already map `notFound` → `404` identically.
- No service function filters by `user_id` — RLS (`supabase/migrations/20260909090431_create_flashcards_table.sql`) is the sole access-control boundary, so only a real-Postgres test can prove Risk #3's protection actually holds.
- `ts-fsrs`'s `TypeConvert.card()` (`node_modules/ts-fsrs/dist/index.umd.js:59-65`) coerces only `state`/`due`/`last_review` — `stability`, `difficulty`, `reps`, `lapses`, `scheduled_days`, `learning_steps` pass through unconverted from whatever the Supabase row returns (research.md, Risk #4).
- `supabase/config.toml:209` — `enable_confirmations = false` locally, so `supabase-js`'s `signUp()` returns an immediately-usable session; no email round-trip needed to create two real test users.
- `src/lib/services/flashcards.service.ts`/`review.service.ts` take a plain `SupabaseClient` parameter — real-DB tests can call them directly with a `@supabase/supabase-js` client authenticated as a real user, with no need to fabricate `@supabase/ssr` cookies or go through `Request`/`AstroCookies`.
- `src/pages/api/flashcards/__tests__/generate.test.ts` (existing cookbook pattern) mocks only the service module (`vi.mock("@/lib/services/...")`) because `generate.ts` never calls `createClient()`. `[id].ts` and `[id]/review.ts` **do** call `createClient()` first — their mocked-tier tests need **both** `vi.mock("@/lib/supabase")` (for the 401/500-null-client cases) **and** `vi.mock("@/lib/services/...")` (for the notFound/error/success mapping cases). This double-mock shape doesn't exist yet in the cookbook.
- `package.json:14` — `"test": "vitest run"` runs every `*.test.ts` file with no DB-dependent/DB-free split today.
- `devDependencies` already includes `supabase` (CLI) — local Supabase workflow is already an established part of this project, just not yet wired into the test suite.

## What We're NOT Doing

- No CI wiring for these integration tests — they stay local-only (`npx supabase start` prerequisite) until rollout Phase 4 ("Quality-gates wiring"). `.github/workflows/ci.yml` is not touched by this plan.
- No test coverage for `GET /api/flashcards` or `GET /api/flashcards/review` (list endpoints) — they take no `id` param, so they have no IDOR surface; RLS already scopes the list to the caller's own rows, which is implicitly exercised by every other test in this plan.
- No exact due-date/stability value assertions — Risk #4 tests assert transition shape (state, due direction, reps count, numeric types), never the FSRS algorithm's internal output values (oracle problem, per test-plan.md §2).
- No `review_logs`/history-table testing — no such table exists (confirmed in the archived `spaced-repetition-review-session` plan).
- No changes to production code in `src/pages/api/` or `src/lib/services/` — the notFound→404 mapping and rating guard already exist correctly; this phase proves them, it doesn't change them.

## Implementation Approach

Four phases, ordered cheapest-and-highest-signal first: (1) mocked-tier route tests need no new infrastructure and immediately prove the notFound→404 mapping and rating-validation guard; (2) real-Supabase test infrastructure is a pure enabler with no risk-specific assertions; (3) Risk #3's real-DB tier is prioritized over Risk #4's because it's the higher-impact risk (cross-user data exposure) and the plan's own Source evidence ranks it first; (4) Risk #4's real-DB tier closes the phase and updates the cookbook.

## Critical Implementation Details

**The double-mock route-test pattern**: `[id].ts` and `[id]/review.ts` both call `createClient()` before delegating to a service. Phase 1's route tests need `vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }))` for the auth-guard/null-client cases (mirroring `index.test.ts`) **and** `vi.mock("@/lib/services/flashcards.service")` / `vi.mock("@/lib/services/review.service")` for the notFound/error/success mapping cases (mirroring `generate.test.ts`). When `createClient` is mocked to return a non-null value, its return value is never actually queried — the mocked service function is what the route interacts with — so a trivial `{} as SupabaseClient` stand-in is enough for `vi.mocked(createClient).mockReturnValue(...)`.

**Real-DB test user cleanup requires a service-role client, separate from the two per-user clients**: `supabase-js`'s `auth.admin.deleteUser(userId)` only works on a client constructed with the **service role key**, not the anon key used for sign-up/sign-in. The shared test helper needs three distinct clients in play: two anon-key clients (one per authenticated test user, used to call the service functions under test) and one service-role client (used only in `afterAll` cleanup, never to exercise application logic). `SUPABASE_SERVICE_ROLE_KEY` is a **test-only** env var — it must not be added to `.env.example` (which documents the app's runtime shape) or to `astro.config.mjs`'s env schema; it's read directly via `process.env.SUPABASE_SERVICE_ROLE_KEY` inside the test helper only, obtained locally via `npx supabase status`.

**FSRS state seeding uses a real UPDATE, not a hand-built row**: to reach a specific starting FSRS state (e.g., a card already in `Review` state with prior `stability`, to test a lapse-to-`Relearning` transition on `Again`), the test creates a real flashcard via `createFlashcard` and then issues a real `.update(...)` on the FSRS columns as the owning user (satisfies the `flashcards_update_own` RLS policy's `auth.uid() = user_id` check) before calling `gradeFlashcardReview`. This keeps every row that `fsrs().next()` ever touches genuinely round-tripped through Postgres — never a hand-built in-memory `Card`.

## Phase 1: Mocked-tier route coverage — ownership mapping and grading validation

### Overview

Proves the notFound→404 mapping (Risk #3) and the invalid-rating guard (Risk #4's "can an out-of-range rating reach the grading logic" question) at the cheap, DB-free layer, following and extending the existing `index.test.ts`/`generate.test.ts` cookbook patterns. No local Supabase required.

### Changes Required:

#### 1. PATCH/DELETE route tests

**File**: `src/pages/api/flashcards/__tests__/[id].test.ts`

**Intent**: Cover `PATCH`/`DELETE /api/flashcards/[id]` at the route layer: 401 (no user), 500 (`createClient` returns null), 400 (invalid body / length validation for PATCH), 404 (service returns `{ notFound: true }`), 500 (service returns `{ error }`), and 200/204 success mapping (service returns `{ data }` / `{ ok: true }`).

**Contract**: `vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }))` and `vi.mock("@/lib/services/flashcards.service", () => ({ updateFlashcard: vi.fn(), deleteFlashcard: vi.fn() }))`. Build `Parameters<typeof PATCH>[0]` / `Parameters<typeof DELETE>[0]` contexts the same way `index.test.ts`'s `makeContext` does, adding `params: { id: "some-id" }`. Assert `updateFlashcard`/`deleteFlashcard` are called with the route's `context.params.id`, and that each of their four result shapes (`{data}`, `{notFound}`, `{error: {code: "validation_error"}}`, `{error: {code: "internal_error"}}`) maps to the route's documented status code.

#### 2. Review-grading route tests

**File**: `src/pages/api/flashcards/__tests__/[id]/review.test.ts`

**Intent**: Cover `POST /api/flashcards/[id]/review`: 401, 500 (null client), 400 for each invalid-rating shape (`0` / `Rating.Manual`, `5`, `"Good"`, `null`, missing), 404 (`notFound`), 500/400 (`error`), 200 success.

**Contract**: `vi.mock("@/lib/supabase", ...)` + `vi.mock("@/lib/services/review.service", () => ({ gradeFlashcardReview: vi.fn() }))`. Parametrize the invalid-rating cases (`test.each([0, 5, -1, "Good", null, undefined])`) and assert `gradeFlashcardReview` is never called for any of them — this is the guard-exists proof research.md called for.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] `npm test` passes (`src/pages/api/flashcards/__tests__/[id].test.ts` and `.../[id]/review.test.ts` included, no local Supabase required)

#### Manual Verification:

- [ ] Temporarily comment out one `notFound` → `404` mapping in `[id].ts` and confirm the corresponding new test fails, then restore it (proves the test isn't vacuously passing)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Real-Supabase integration test infrastructure

### Overview

Introduces the shared helper for creating, authenticating, and cleaning up two real Supabase users against a local instance, plus the `npm test` / `npm run test:integration` script split so the DB-free suite stays fast and Docker-independent by default.

### Changes Required:

#### 1. Real-Supabase test-user helper

**File**: `src/lib/services/__tests__/helpers/real-supabase.ts`

**Intent**: Provide `createTwoRealUsers()`, returning `{ userA: { client, id }, userB: { client, id }, cleanup: () => Promise<void> }`. Each `client` is a real `@supabase/supabase-js` client authenticated (via `signUp`, relying on `enable_confirmations = false`) as a distinct, randomly-suffixed test user against `process.env.SUPABASE_URL`. `cleanup()` uses a separate service-role client (`process.env.SUPABASE_SERVICE_ROLE_KEY`) to call `auth.admin.deleteUser` for both users (their `flashcards` rows cascade-delete via the `on delete cascade` FK in `20260909090431_create_flashcards_table.sql`).

**Contract**: If `SUPABASE_URL` or the anon key resolve empty, or the initial `signUp` call throws (e.g., connection refused), throw an `Error` with the message `"Local Supabase is not reachable — run \`npx supabase start\` before running integration tests."` so a missing-Docker run fails legibly instead of with a raw fetch error. This is the "readable failing test" behavior chosen for this phase.

#### 2. npm script split

**File**: `package.json`

**Intent**: Keep the default `npm test` fast and Docker-independent; add an explicit opt-in command for the new DB-dependent suite.

**Contract**: `"test": "vitest run --exclude '**/*.integration.test.ts'"` (replaces the current `"vitest run"`); add `"test:integration": "vitest run **/*.integration.test.ts"`.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] `npm test` still passes and does not attempt any network call to Supabase
- [ ] With `npx supabase start` running, a throwaway smoke test using `createTwoRealUsers()` successfully creates and cleans up two users (verified via `npx supabase status` / Studio, no leftover test rows after `cleanup()`)
- [ ] With `npx supabase start` **not** running, `npm run test:integration` fails with the helper's readable connection-error message, not a raw stack trace

#### Manual Verification:

- [ ] Confirm `SUPABASE_SERVICE_ROLE_KEY` is obtainable locally via `npx supabase status` and works end-to-end for cleanup

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Risk #3 — cross-user IDOR real-DB integration tests

### Overview

Proves, against real Postgres RLS, that user B cannot read, update, delete, or grade user A's flashcard through `flashcards.service.ts`/`review.service.ts`, even with the correct row id.

### Changes Required:

#### 1. Cross-user service-layer tests

**File**: `src/lib/services/__tests__/flashcards.service.integration.test.ts`

**Intent**: Using `createTwoRealUsers()`, user A creates a flashcard via `createFlashcard`. Then, using **user B's** real client and user A's real row id, call `updateFlashcard` and `deleteFlashcard` directly and assert each returns `{ notFound: true }` — never `{ data }` and never a Postgres error — proving RLS returns an empty result rather than either succeeding or throwing. Follow with user A's own client performing the same calls successfully, to confirm the row genuinely still exists and is still owned by A (ruling out "it returned notFound because the row was actually deleted/corrupted").

**Contract**: `afterAll(cleanup)`. No mocking of `@/lib/supabase` or the service module — these tests import `updateFlashcard`/`deleteFlashcard` and call them with the real clients from the helper.

#### 2. Cross-user grading test

**File**: `src/lib/services/__tests__/review.service.integration.test.ts` (shared with Phase 4's file — see Phase 4 for the additional cases added to this same file)

**Intent**: User A creates a flashcard; user B's client calls `gradeFlashcardReview` with user A's row id and any valid rating; assert `{ notFound: true }`, and that user A's row is unaffected (re-fetch via user A's client, assert `reps`/`state`/`due` unchanged from before B's attempt).

**Contract**: Same real-client, no-mocking approach as above.

### Success Criteria:

#### Automated Verification:

- [ ] `npm run test:integration` passes (requires `npx supabase start`)
- [ ] Type checking passes: `npm run lint`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:

- [ ] Temporarily remove the `flashcards_update_own`/`flashcards_delete_own` RLS policies locally (via `psql` against the local instance) and confirm the corresponding tests fail, then restore the migration state (proves the tests exercise real RLS, not app-level logic)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Risk #4 — FSRS grading data-integrity real-DB integration tests

### Overview

Proves each of the 4 ratings produces a plausible FSRS transition through a real Postgres round-trip, and that the 6 numeric fields `TypeConvert.card()` doesn't coerce survive that round-trip as real JS numbers. Closes the phase by updating the test-plan cookbook.

### Changes Required:

#### 1. Parametrized grading-transition tests

**File**: `src/lib/services/__tests__/review.service.integration.test.ts` (same file as Phase 3's cross-user grading test)

**Intent**: For a freshly-created flashcard (default `New` state), `test.each([Rating.Again, Rating.Hard, Rating.Good, Rating.Easy])` grades it once via `gradeFlashcardReview` using its real owner's client, then asserts: `state` changed from the pre-grade value in a direction consistent with the rating (documented via a small comment citing the `State`/`Rating` enums, not asserting the library's internal target state), `due` (parsed as a `Date`) is strictly later than the pre-grade `due`, `reps` increased by exactly 1, and — the core Risk #4 assertion — `typeof updated.stability === "number"`, `typeof updated.difficulty === "number"`, and the same for `reps`/`lapses`/`scheduled_days`/`learning_steps` (i.e., the fields `TypeConvert.card()` does not coerce actually arrive as numbers after the real Supabase round-trip, not strings).

**Contract**: Re-fetch the row via the owning user's client after grading (don't trust the service's returned `data` alone) to confirm the persisted row — not just the in-memory scheduler result — has the expected shape.

#### 2. Seeded-state relapse test

**File**: `src/lib/services/__tests__/review.service.integration.test.ts`

**Intent**: Using the direct-UPDATE seeding approach (Critical Implementation Details), set a flashcard's `state` to `Review` (2) with a nonzero `stability`/`reps`, then grade it `Again` and assert `state` becomes `Relearning` (3) and `lapses` increments — the one transition that can't be reached from a single grade of a brand-new card.

**Contract**: Direct `.update({ state: 2, stability: 5, reps: 3, ... }).eq("id", id)` as the owning user before calling `gradeFlashcardReview`.

#### 3. Cookbook update

**File**: `context/foundation/test-plan.md`

**Intent**: Fill in §6.2 (add the double-mock route-test pattern) and §6.5 (currently "TBD — see §3 Phase 2") with the real-Supabase service-layer integration pattern this phase shipped: the `createTwoRealUsers()` helper, the `test`/`test:integration` script split, and the direct-UPDATE state-seeding technique.

**Contract**: Replace §6.5's "TBD" line with the shipped pattern description; append the double-mock note to §6.2's bullet list.

### Success Criteria:

#### Automated Verification:

- [ ] `npm run test:integration` passes (requires `npx supabase start`)
- [ ] Type checking passes: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] `npm test` (DB-free suite) still passes unaffected

#### Manual Verification:

- [ ] Manually inspect one graded row via Supabase Studio (local) to visually confirm `stability`/`difficulty` are stored as `numeric`, not text, corroborating the automated `typeof` assertion

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful. This is the final phase of the rollout — after confirmation, update `context/foundation/test-plan.md` §3 Phase 2 Status to `complete`.

---

## Testing Strategy

### Unit Tests:

- N/A — this phase adds only integration-level and mocked-route-level tests; no new pure-logic unit needed beyond what Phase 1/2 of the rollout already covers.

### Integration Tests:

- Mocked-tier: `[id].test.ts`, `[id]/review.test.ts` (Phase 1)
- Real-DB tier: `flashcards.service.integration.test.ts`, `review.service.integration.test.ts` (Phases 3-4)

### Manual Testing Steps:

1. Phase 1's mutation-test (temporarily break a mapping, confirm the new test catches it).
2. Phase 2's helper smoke test (create/cleanup two users, verify via Studio).
3. Phase 3's RLS-policy-removal check (temporarily drop a policy, confirm the cross-user test fails).
4. Phase 4's Studio inspection of a graded row's column types.

## Performance Considerations

None — test-only change, no runtime code touched. Real-DB integration tests will be slower than mocked tests (real network round-trips to local Supabase); this is expected and why they're split into a separate `test:integration` script rather than bundled into the default `npm test`.

## Migration Notes

No schema changes. No new migrations.

## References

- Related research: `context/changes/testing-authorization-data-integrity-coverage/research.md`
- Existing mock-route pattern: `src/pages/api/flashcards/__tests__/index.test.ts`, `src/pages/api/flashcards/__tests__/generate.test.ts`
- RLS policies: `supabase/migrations/20260909090431_create_flashcards_table.sql`
- FSRS columns: `supabase/migrations/20260910054657_add_flashcard_srs_columns.sql`
- `ts-fsrs` `TypeConvert.card()`: `node_modules/ts-fsrs/dist/index.umd.js:59-65`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Mocked-tier route coverage — ownership mapping and grading validation

#### Automated

- [x] 1.1 Type checking passes: `npm run lint`
- [x] 1.2 Build succeeds: `npm run build`
- [x] 1.3 `npm test` passes (new `[id].test.ts` and `[id]/review.test.ts` included)

#### Manual

- [x] 1.4 Temporarily break a `notFound` → `404` mapping and confirm the new test fails, then restore it

### Phase 2: Real-Supabase integration test infrastructure

#### Automated

- [ ] 2.1 Type checking passes: `npm run lint`
- [ ] 2.2 Build succeeds: `npm run build`
- [ ] 2.3 `npm test` still passes with no Supabase network calls
- [ ] 2.4 Smoke test creates and cleans up two real users with `npx supabase start` running
- [ ] 2.5 `npm run test:integration` fails with the readable connection-error message when Supabase is not running

#### Manual

- [ ] 2.6 Confirm `SUPABASE_SERVICE_ROLE_KEY` obtainable via `npx supabase status` and works for cleanup

### Phase 3: Risk #3 — cross-user IDOR real-DB integration tests

#### Automated

- [ ] 3.1 `npm run test:integration` passes
- [ ] 3.2 Type checking passes: `npm run lint`
- [ ] 3.3 Build succeeds: `npm run build`

#### Manual

- [ ] 3.4 Temporarily remove the update/delete RLS policies locally and confirm the corresponding tests fail, then restore

### Phase 4: Risk #4 — FSRS grading data-integrity real-DB integration tests

#### Automated

- [ ] 4.1 `npm run test:integration` passes
- [ ] 4.2 Type checking passes: `npm run lint`
- [ ] 4.3 Build succeeds: `npm run build`
- [ ] 4.4 `npm test` (DB-free suite) still passes unaffected

#### Manual

- [ ] 4.5 Manually inspect a graded row via Supabase Studio to confirm numeric column types
