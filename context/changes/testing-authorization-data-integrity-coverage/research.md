---
date: 2026-09-11T00:27:32+0200
researcher: Claude Sonnet 5
git_commit: f96b58d81d9624943bcfd2e03a466e00b91f84d6
branch: master
repository: 10xCards
topic: "Rollout Phase 2 — Authorization and data-integrity coverage (Risk #3, Risk #4)"
tags: [research, codebase, rls, idor, fsrs, review.service, flashcards.service, supabase]
status: complete
last_updated: 2026-09-11
last_updated_by: Claude Sonnet 5
---

# Research: Rollout Phase 2 — Authorization and data-integrity coverage (Risk #3, Risk #4)

**Date**: 2026-09-11T00:27:32+0200
**Researcher**: Claude Sonnet 5
**Git Commit**: f96b58d81d9624943bcfd2e03a466e00b91f84d6
**Branch**: master
**Repository**: 10xCards

## Research Question

Ground rollout Phase 2 of `context/foundation/test-plan.md` (Risk #3 — cross-user IDOR on flashcards; Risk #4 — FSRS grading data-integrity) in actual code: locate the real failure path, quote the relevant lines, verify or correct the test-plan's response guidance, inventory existing tests, pick the cheapest useful test layer per risk, and flag any speculative risk or misleading hot-spot evidence.

## Summary

Both risks are real and their response guidance is directionally correct, but each needed a correction:

- **Risk #3**: The route→404 mapping the guidance worried about **already exists and is consistent** across all three mutating routes (`PATCH`/`DELETE /api/flashcards/[id]`, `POST /api/flashcards/[id]/review`) — all three service functions treat a 0-row Supabase result as `{ notFound: true }`, and all three routes map that to `404`. This was previously verified only **manually via curl** (see Historical Context) and has **zero automated coverage** today. The bigger, sharper finding: none of the service queries filter by `user_id` at all — RLS is the *only* access-control mechanism in this codebase (no defense-in-depth). That makes a real-DB integration test not just "the cheapest layer" but the **only** layer capable of proving the boundary at all — a mocked Supabase client would trivially "pass" this test regardless of whether RLS actually works. The plan's cheapest-layer call is correct, but it can be split into two tiers (see Detailed Findings) rather than one expensive round-trip through cookies.
- **Risk #4**: The DB-round-trip concern is real, but more specific than the guidance states, and sharper than the prior archived plan assumed. `ts-fsrs`'s `TypeConvert.card()` only coerces **3 of 9** persisted fields (`state`, `due`, `last_review`) — `stability`, `difficulty`, `reps`, `lapses`, `scheduled_days`, `learning_steps` are passed through **unchanged** from whatever the Supabase row returns. The archived `spaced-repetition-review-session` plan claimed `TypeConvert.card()` "normalizes a raw row back into a typed Card" without qualification — that claim is too broad for 6 of the 9 fields. In today's PostgREST wire format this is very likely benign (Postgres `numeric`/`int` columns serialize as JSON numbers, not strings), but nothing in this codebase asserts that today, and nothing would throw if it silently stopped being true. This is exactly the kind of assumption an integration test against a real row should pin down, and the "assert the shape of the transition, not exact values" guidance is correct and directly actionable.

Existing tests cover **none** of the routes/services these two risks touch: `src/pages/api/flashcards/[id].ts`, `src/pages/api/flashcards/[id]/review.ts`, `src/pages/api/flashcards/review.ts`, `flashcards.service.ts`, and `review.service.ts` have zero test files today. No local-Supabase test infrastructure (env wiring, real-user test helper, CI service container) exists yet — Phase 2's plan has to introduce it from scratch, and CI currently does not run `npm test` at all (that's Phase 4's job per the rollout table), so these new integration tests will initially be **local-only**.

## Detailed Findings

### Risk #3 — Cross-user IDOR on flashcards

**The route→404 mapping already exists, three times over, identically shaped:**

- `src/pages/api/flashcards/[id].ts:46-57` (PATCH) and `:80-87` (DELETE):
  ```ts
  if ("notFound" in result) {
    return Response.json({ error: { code: "not_found", message: "Flashcard not found." } }, { status: 404 });
  }
  ```
- `src/pages/api/flashcards/[id]/review.ts:50-53` (the newer grading route) uses the **exact same pattern** — confirming the test-plan's "did newer routes get the same treatment" question with a yes:
  ```ts
  const result = await gradeFlashcardReview(supabase, id, body.rating);
  if ("notFound" in result) {
    return Response.json({ error: { code: "not_found", message: "Flashcard not found." } }, { status: 404 });
  }
  ```

**The notFound signal originates purely from an empty Supabase result array, never from a Postgres error** — confirming the guidance's premise exactly:

- `src/lib/services/flashcards.service.ts:50-64` (`updateFlashcard`) and `:67-82` (`deleteFlashcard`):
  ```ts
  const { data, error } = await supabase.from("flashcards").update({...}).eq("id", id).select();
  if (error) { return { error: mapError(error) }; }
  if (data.length === 0) { return { notFound: true }; }
  ```
- `src/lib/services/review.service.ts:53-59` (`gradeFlashcardReview`) fetches first, same shape:
  ```ts
  const { data: existing, error: fetchError } = await supabase.from("flashcards").select("*").eq("id", id);
  if (fetchError) { return { error: mapError(fetchError) }; }
  if (existing.length === 0) { return { notFound: true }; }
  ```

**Sharper finding than the guidance states: there is no app-level `user_id` filter anywhere.** None of `listFlashcards`, `updateFlashcard`, `deleteFlashcard`, `listDueFlashcards`, or `gradeFlashcardReview` add `.eq("user_id", ...)` to their queries. The *only* thing preventing user B from touching user A's row is the RLS policy evaluated by Postgres against the JWT embedded in the request's session — confirmed at `supabase/migrations/20260909090431_create_flashcards_table.sql`:

```sql
create policy flashcards_update_own on public.flashcards for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy flashcards_delete_own on public.flashcards for delete to authenticated
  using (auth.uid() = user_id);
```

This raises the importance of the integration test beyond "nice to have real DB coverage" — a test that mocks `@/lib/supabase` (as every existing route test does, e.g. `src/pages/api/flashcards/__tests__/index.test.ts:9-11`) **cannot** exercise this boundary at all; the mock would return whatever the test wired it to return regardless of which user is asking. Only a real Postgres connection with real RLS evaluates the actual security boundary.

**Correction to the plan's "likely cheapest layer":** the guidance says "integration (two distinct real authenticated sessions)" as if one test shape covers everything. Two genuinely different things are being proven, at two different costs:

1. **The RLS boundary itself** (empty array, not error, for someone else's row) — only provable against real Supabase, with two real authenticated users. This is the expensive, necessary tier. It doesn't require going through the HTTP route/cookie layer at all — the service functions (`updateFlashcard`, `deleteFlashcard`, `gradeFlashcardReview`) take a plain `SupabaseClient` parameter, so a test can call them directly with a `@supabase/supabase-js` client authenticated as user B (via `signInWithPassword`, or the session returned by `signUp` — see Environment gap below) and user A's row id. This is cheaper than round-tripping through `createServerClient`'s cookie machinery (`src/lib/supabase.ts:5-24`) and Astro's `APIRoute` context, and it's the layer where the actual risk lives.
2. **The route's notFound→404 status-code mapping** — pure application logic with no Supabase-specific behavior once `result` is known. This is already provable at the existing cheap layer (mock `createClient` to return a client whose `.update()/.delete()/.select()` chain resolves to `{ data: [], error: null }`, following the exact pattern in `src/pages/api/flashcards/__tests__/helpers/fake-supabase.ts`). Doing this at the real-DB layer too is not wrong, but redundant with tier 1 if the goal is just proving the status-code translation — cost×signal (test-plan.md §1 principle 1) favors keeping the mapping check at the mock layer and reserving the real-DB tier for what only real RLS can prove.

**Anti-pattern check**: confirmed present and worth guarding against — there is currently no test anywhere (401-only or otherwise) for `[id].ts`, `[id]/review.ts`, `review.ts`, `flashcards.service.ts`, or `review.service.ts`. The 401-vs-404 distinction the guidance warns about isn't accidentally already covered by an existing shallow test; it simply doesn't exist yet.

### Risk #4 — FSRS grading data-integrity

**The DB round-trip, quoted exactly:**

- `src/lib/services/review.service.ts:17-30` (`toCard`, row → typed `Card`):
  ```ts
  function toCard(flashcard: Flashcard): Card {
    return TypeConvert.card({
      due: flashcard.due,
      stability: flashcard.stability,
      difficulty: flashcard.difficulty,
      elapsed_days: 0, // deprecated in ts-fsrs, not persisted — TypeConvert.card() requires it on the input shape
      scheduled_days: flashcard.scheduled_days,
      learning_steps: flashcard.learning_steps,
      reps: flashcard.reps,
      lapses: flashcard.lapses,
      state: flashcard.state,
      last_review: flashcard.last_review,
    });
  }
  ```
- `src/lib/services/review.service.ts:62` (scheduler call): `const { card: updatedCard } = fsrs().next(toCard(existing[0] as Flashcard), new Date(), rating);`
- `src/lib/services/review.service.ts:64-78` (typed `Card` → persisted row): writes `due`, `stability`, `difficulty`, `state`, `reps`, `lapses`, `scheduled_days`, `learning_steps`, `last_review` back via `.update(...).eq("id", id).select()`.

**`TypeConvert.card()` coerces only 3 of the 9 fields — verified directly in the installed package, not assumed:**

`node_modules/ts-fsrs/dist/index.umd.js:60-65`:
```js
class TypeConvert {
  static card(card) {
    return __spreadProps$2(__spreadValues$2({}, card), {
      state: TypeConvert.state(card.state),
      due: TypeConvert.time(card.due),
      last_review: card.last_review ? TypeConvert.time(card.last_review) : void 0
    });
  }
  ...
```

Everything else (`stability`, `difficulty`, `reps`, `lapses`, `scheduled_days`, `learning_steps`) is spread through **as-is** from whatever shape the Supabase row handed it. `TypeConvert.state()` and `TypeConvert.time()` do handle string-or-number / string-or-Date inputs defensively (`node_modules/ts-fsrs/dist/index.umd.js:79-96`), which is why `state`/`due`/`last_review` are safe even if PostgREST ever returned them in an unexpected shape — but there is no equivalent safety net for the numeric fields.

**This corrects the archived plan's assumption, not just the current test-plan's guidance.** `context/archive/2026-09-10-spaced-repetition-review-session/plan.md:25` states: *"Postgres/Supabase round-trips `due`/`last_review` as ISO strings and `state` as a string/number; `TypeConvert.card()` normalizes a raw row back into a typed `Card` before calling `scheduler.next()`."* That sentence is accurate for the 3 fields it names, but was written (and is easy to misread) as if it covers the whole row — it doesn't extend to the 6 numeric/integer fields, which is exactly where the current test-plan's "type/format coercion at the Postgres boundary" concern should be pointed.

**Whether this is actually dangerous today**: Postgres's `numeric` and integer column types serialize as unquoted JSON numbers via PostgREST's `row_to_json`-based response encoding (not JSON strings), so `stability`/`difficulty` (declared `numeric` in `supabase/migrations/20260910054657_add_flashcard_srs_columns.sql`) should arrive as JS numbers after `supabase-js` parses the HTTP response — meaning `fsrs().next()` likely receives real numbers today. **This has not been verified against this repo's actual local Supabase instance** — that verification is precisely what the integration test should do, since (a) it's cheap to assert directly (`typeof card.stability === "number"`) once a real row is fetched, and (b) if this assumption were ever violated (a driver version bump, a future column type change, a raw-SQL view added later), the failure mode is silent corruption — `fsrs().next()` would receive a string, and depending on the internal arithmetic this could produce `NaN` propagated into every subsequent scheduling field with **no thrown exception and a 200 response** — the worst-case failure shape for a "data must never be corrupted" guardrail (PRD guardrail cited as risk #4's source).

**Column ↔ Card mapping, confirmed 1:1 and complete** (test-plan asked to ground this): `supabase/migrations/20260910054657_add_flashcard_srs_columns.sql` adds exactly the 9 columns `toCard`/the persist-back block read and write (`due`, `stability`, `difficulty`, `state`, `reps`, `lapses`, `scheduled_days`, `learning_steps`, `last_review`), plus the migration's own comment confirms the `state` enum mapping matches `ts-fsrs`'s `State` enum (`New=0, Learning=1, Review=2, Relearning=3`, verified against `node_modules/ts-fsrs/dist/index.d.ts:2-7`).

**Whether an out-of-range rating can reach the grading logic — verified, already guarded:**

- `src/pages/api/flashcards/[id]/review.ts:7-11`:
  ```ts
  const GRADE_VALUES: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];
  function isGrade(value: unknown): value is Grade {
    return typeof value === "number" && GRADE_VALUES.includes(value);
  }
  ```
- `ts-fsrs`'s `Rating` enum (`node_modules/ts-fsrs/dist/index.d.ts:9-15`) is `Manual=0, Again=1, Hard=2, Good=3, Easy=4`. `isGrade` deliberately excludes `Rating.Manual` (0) and any non-number/out-of-range value, mapping to `400 validation_error` (`src/pages/api/flashcards/[id]/review.ts:38-48`) before `gradeFlashcardReview` is ever called. This guard already exists and is correct — the test here should **prove** the guard (send `0`, `5`, `"Good"`, `null` → expect 400, service never invoked), not assume it's missing.

**Anti-pattern check (oracle problem)**: correct as stated. No existing test tries to assert exact `due`/`stability` values (none exist at all yet for this path), so there's no existing violation to fix, but the guidance is the right thing to hold the line on once tests are written — assert `state` transitions plausibly (e.g., `New` → `Learning` on first `Again`/`Good`, never back to a lower-numbered non-relapse state on `Easy`), `due` moves strictly forward from the pre-grade value, and `reps` increments by exactly 1 — not the library's internal stability/difficulty formula output.

### Existing test inventory (what's already covered vs. not)

`find src -path '*__tests__*'` today:
- `src/components/flashcards/__tests__/CandidateCard.test.tsx` — Risk #1, unrelated.
- `src/lib/__tests__/bootstrap.test.ts` — proves `createClient()` returns `null` when `SUPABASE_URL`/`SUPABASE_KEY` are unset in the Vitest process (`src/lib/__tests__/bootstrap.test.ts:11-14`). Important for Phase 2: **no env vars are stubbed for any existing test**, so today's test process has no path to a real Supabase instance at all — Phase 2 has to introduce that wiring (see Environment gap).
- `src/lib/services/__tests__/ai-flashcard-generation.service.test.ts`, `src/pages/api/flashcards/__tests__/generate.test.ts` — Risk #2, unrelated.
- `src/pages/api/flashcards/__tests__/index.test.ts` + `helpers/fake-supabase.ts` — Risk #1 and the `POST`/`GET /api/flashcards` mock pattern (§6.2 cookbook). This is the pattern tier-2 of Risk #3 (the route-level mapping check) should reuse.

**Zero test files exist** for: `src/pages/api/flashcards/[id].ts`, `src/pages/api/flashcards/[id]/review.ts`, `src/pages/api/flashcards/review.ts`, `src/lib/services/flashcards.service.ts`, `src/lib/services/review.service.ts`. Phase 2 is greenfield for all of these.

### Environment gap: no real-Supabase test infrastructure exists yet

This is a genuine gap the plan must close, not a research finding to defer:

- `vitest.config.ts` and `vitest.astro-env-server.stub.ts` (`src/lib/__tests__/bootstrap.test.ts` confirms this) read `SUPABASE_URL`/`SUPABASE_KEY` straight from `process.env` — so pointing the test process at local Supabase is as simple as setting those two env vars before `npm test` (e.g. from `npx supabase status`'s local API URL + anon key). No code change needed to make this path work, but the values are not currently set anywhere for tests (`.env.example` only documents the shape, `.env`/`.dev.vars` are gitignored and not test-scoped).
- `supabase/config.toml:209` — `enable_confirmations = false` under `[auth.email]` locally, so `supabase-js`'s `signUp()` returns an immediately-usable session locally, without an email-confirmation round trip. Two test users can be created and authenticated purely in-process against local Supabase.
- Because `flashcards.service.ts`/`review.service.ts` take a plain `SupabaseClient` parameter (not Astro's cookie-based wrapper), the real-DB tier of these tests does **not** need to fabricate `@supabase/ssr` cookies at all — it can construct two independent `@supabase/supabase-js` clients (`createClient(localUrl, anonKey)`), sign each in as a distinct real user, and call the service functions directly. This sidesteps `src/lib/supabase.ts`'s cookie-parsing entirely, which is both cheaper and more direct than the alternative of round-tripping through `Request`/`AstroCookies` with hand-built session cookies.
- `.github/workflows/ci.yml` runs `lint` and `build` only — **no `npm test` step exists in CI at all today**. Per `test-plan.md` §3 Phase 4 ("Quality-gates wiring... not started"), unit/integration is not a required CI gate yet. This means the new Phase 2 tests, if they require a running local Supabase instance, cannot run in CI until Phase 4 wires that in (either a `supabase/setup-cli` + `supabase start` CI step, or a Postgres/GoTrue service container) — the plan phase should decide explicitly whether Phase 2 ships these tests as local-only-for-now (documented as such) or pulls forward a minimal CI Supabase step ahead of Phase 4's formal gate-wiring. Not deciding this leaves the new tests unable to protect anyone by default.

## Code References

- `src/pages/api/flashcards/[id].ts:46-57,80-87` — PATCH/DELETE notFound→404 mapping
- `src/pages/api/flashcards/[id]/review.ts:7-11,38-53` — grade validation guard + notFound→404 mapping
- `src/pages/api/flashcards/review.ts:5-24` — list-due route, no ownership-mapping surface (GET only, no id param)
- `src/pages/api/flashcards/index.ts:8-27,29-73` — list/create routes, existing mock-test pattern to reuse for tier-2 checks
- `src/lib/services/flashcards.service.ts:45-82` — `updateFlashcard`/`deleteFlashcard`, no `user_id` filter, RLS-only scoping
- `src/lib/services/review.service.ts:17-30,48-88` — `toCard` mapping + `gradeFlashcardReview`'s fetch/schedule/persist round-trip
- `src/lib/supabase.ts:5-24` — cookie-based `createClient()`; not required for the real-DB tier of these tests
- `supabase/migrations/20260909090431_create_flashcards_table.sql` — RLS policies (`flashcards_update_own`, `flashcards_delete_own`, etc.)
- `supabase/migrations/20260910054657_add_flashcard_srs_columns.sql` — FSRS column set + `state` enum comment
- `supabase/config.toml:202-209` — `enable_confirmations = false`, enables immediate local sign-in
- `node_modules/ts-fsrs/dist/index.umd.js:59-65` — `TypeConvert.card()` implementation (3-of-9 field coercion)
- `node_modules/ts-fsrs/dist/index.d.ts:2-15` — `State`/`Rating` enum values
- `src/pages/api/flashcards/__tests__/index.test.ts`, `helpers/fake-supabase.ts` — existing mock-Supabase route-test pattern
- `src/lib/__tests__/bootstrap.test.ts:11-14` — confirms no env vars are stubbed for any test today
- `.github/workflows/ci.yml` — no `npm test` step exists yet

## Architecture Insights

- RLS is the sole access-control mechanism for `flashcards` — no service function adds an app-level `user_id` filter anywhere. This is a deliberate, consistent pattern (confirmed across list/create/update/delete/grade), not an oversight in one route, but it does mean there is no defense-in-depth: a test that only mocks Supabase can never validate this boundary, regardless of how thorough its assertions are.
- The `{ data } | { notFound: true } | { error }` discriminated-result shape is a consistent, repo-wide convention across all three service modules touching flashcards (`flashcards.service.ts`, `review.service.ts`) — new service functions should keep following it rather than introducing a different not-found signal.
- `ts-fsrs`'s `TypeConvert.card()` is a partial normalizer, not a full row-sanitizer — a name like "normalizes a raw row" (as the archived plan phrased it) invites over-trusting it for fields it doesn't touch. Worth a `context/foundation/lessons.md` entry once Phase 2 ships a test that pins this down, so future FSRS-adjacent changes don't re-assume full coercion.

## Historical Context (from prior changes)

- `context/archive/2026-09-09-manual-flashcard-management/plan.md:45` — first documented the RLS-empty-array/not-found-mapping requirement ("UPDATE/DELETE on a nonexistent-or-not-yours row returns zero rows, not an error... The service functions must treat 'empty result array' as a distinct not-found case so the route can return 404"). Confirms Risk #3's premise was known and deliberately designed for at CRUD-route birth.
- `context/archive/2026-09-09-manual-flashcard-management/plan.md:115,206` — the cross-user check ("A second test user cannot PATCH/DELETE/see the first user's flashcard via these routes") was listed only as a **manual curl-based verification step**, never automated ("No automated unit/integration tests are added — no test framework exists in this repo"). Phase 2 is the first automation of this specific check.
- `context/archive/2026-09-10-spaced-repetition-review-session/plan.md:22-26` — the plan that introduced `gradeFlashcardReview`/`toCard`; its claim that `TypeConvert.card()` "normalizes a raw row back into a typed Card" needs the correction noted above (3-of-9 fields, not the whole row).
- `context/changes/testing-bootstrap-ai-review-critical-path/` (Phase 1, complete) — established the Vitest 5 setup, the mock-`@/lib/supabase` route-test pattern, and the `astro:env/server` stub that Phase 2's real-Supabase env wiring builds on top of (same stub file, real values instead of unset ones).

## Related Research

- `context/changes/testing-bootstrap-ai-review-critical-path/research.md` — Phase 1's research (Risk #1/#2), establishes the mock-boundary test conventions this phase's tier-2 checks reuse.

## Open Questions

1. **CI wiring for Phase 2's tests**: should Phase 2 ship these integration tests as local-only (documented prerequisite: `npx supabase start`), or pull forward a minimal CI Supabase step ahead of the formally-scheduled Phase 4 gate-wiring? Left to the plan phase — this research only surfaces that the gap exists and blocks these tests from protecting anyone via CI until decided.
2. **Numeric coercion, unverified against a live instance**: this research concludes (from PostgREST's documented `numeric`→JSON-number serialization behavior and reading the `ts-fsrs` source) that `stability`/`difficulty` almost certainly arrive as real JS numbers today, but this was not confirmed by actually querying this repo's local Supabase instance. The integration test itself is the intended way to close this — flagging it here so the plan doesn't skip writing that specific assertion (`typeof` check on the fetched row before/after `toCard()`) on the assumption this research already settled it.
3. **Test-user cleanup**: Phase 2's plan needs to decide how the two real test users (and their flashcard rows) created against local Supabase get cleaned up between test runs — no existing pattern in this repo addresses teardown of real auth users (Phase 1's tests never touched real Supabase data).
