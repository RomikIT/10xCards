# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-10

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "<the
   team is worried about X, and the failure would surface somewhere in
   <area>>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents _what
   could fail_ and _why we believe it's likely_ — drawn from documents,
   interview, and codebase _signal_ (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/migrations/` (excluding `dist/`, `node_modules/`, `context/archive/`).

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the _evidence that surfaced
this risk_ — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| #   | Risk (failure scenario)                                                                                                                                                                                            | Impact | Likelihood | Source (evidence — not anchor)                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | User accepts/edits/rejects an AI-generated candidate, and the server persists something other than what they saw (original instead of edit, a duplicate from a double-click, or a rejected candidate saved anyway) | High   | High       | interview Q3 ("generation and deck management flow" — area changed with least confidence) \| PRD US-01 acceptance criteria \| archive/ai-generated-flashcard-review/plan.md                                                              |
| 2   | OpenRouter is unavailable, returns an invalid key error, or returns malformed data, and the user sees a hang or a raw error instead of a clear, actionable message                                                 | High   | High       | interview Q1 (external-integration outage is the top-named worry) \| PRD NFR ("acknowledgement... continuous visible progress during AI-generation") \| infrastructure.md risk register \| archive/ai-generated-flashcard-review/plan.md |
| 3   | One authenticated user reads, edits, or deletes another user's flashcard through the API, despite per-user RLS policies                                                                                            | High   | Medium     | PRD Access Control ("no cross-user visibility or sharing") \| archive/manual-flashcard-management/plan.md (RLS insert/not-found mapping) \| abuse/security lens (auth + user input present)                                              |
| 4   | Grading a review corrupts or mis-transitions a flashcard's FSRS scheduling state (due/stability/state/reps), violating the product's data-integrity guardrail                                                      | High   | Medium     | PRD guardrail ("flashcard data must never be lost or corrupted") \| archive/spaced-repetition-review-session/plan.md (DB row ↔ Card mapping)                                                                                             |
| 5   | An unhandled exception from the Supabase Auth SDK (signup/signin/signout/middleware) regresses over time despite prior hardening, surfacing a raw 500 instead of a friendly error                                  | Medium | Medium     | context/changes/auth-error-handling-hardening/ (prior finding + fix) \| infrastructure.md risk register                                                                                                                                  |
| 6   | An unauthenticated visitor reaches protected page content (`/dashboard`, `/flashcards`) because the routing-level auth gate regresses — a new protected route is added without registering it, or the redirect check itself breaks — surfacing rendered content instead of a redirect to `/auth/signin` | High   | Low        | M3L4 course exercise (2026-09-11): confirmed live via Playwright CLI that an unauthenticated session hitting `/dashboard` or `/flashcards` today correctly lands on `/auth/signin` \| `src/middleware.ts:16-20` (`PROTECTED_ROUTES` array + `context.locals.user` check) — a hand-maintained list, not derived from route structure, so it can silently drift |

**Added 2026-09-11, out-of-band of the phased rollout below** (see §3 note)
— this risk exists purely at the rendered-page/routing boundary and was
added specifically as one of the two E2E candidates for the M3L4
(`/10x-e2e`) course exercise, run in **standalone** mode rather than as a
new rollout phase, per interview Q5's "don't overinvest" stance. Re-evaluate
whether it deserves a full phase if `PROTECTED_ROUTES` grows past a couple
of entries or a real regression is ever found here.

**Impact × Likelihood rubric.** Score both axes on a coarse High / Medium /
Low scale so two readers agree on the same row.

| Rating | Impact                                                          | Likelihood                                               |
| ------ | --------------------------------------------------------------- | -------------------------------------------------------- |
| High   | user loses access, data, or money; failure is publicly visible  | area changes weekly, or we have already been burned here |
| Medium | feature degrades, a workaround exists, only some users affected | touched occasionally, has been a source of bugs          |
| Low    | cosmetic, easily reverted, no data effect                       | stable code, rarely touched                              |

**Challenger findings:** a candidate risk about study-text/AI-response content leaking beyond the scope of a single request (PRD NFR on non-retention) was considered and dropped — no logging or persistence mechanism exists anywhere in the codebase that could leak it, so the risk currently describes a safeguard that would need to be _added_ first, not a defect in what exists. Re-evaluate if logging/observability is introduced.

### Risk Response Guidance

| Risk | What would prove protection                                                                                                                                                                                                    | Must challenge                                                                                                                                                                                                         | Context `/10x-research` must ground                                                                                                                  | Likely cheapest layer                                                                                          | Anti-pattern to avoid                                                                                                                                                                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1   | Accepting a candidate as-is saves exactly what was shown; editing before accepting saves the edit, not the original; rejecting never triggers a network call; a double-click on Accept/Reject doesn't produce a duplicate save | Removal from the client-side list is not proof the server-side save actually succeeded or matched what was shown                                                                                                       | `CandidateCard`'s local state flow, the `POST /api/flashcards` contract, whether any server-side duplicate protection exists                         | integration (component + mocked fetch boundary, or API-level)                                                  | asserting against the component's internal state instead of the actually-saved flashcard/network payload (oracle problem)                                                                                                                                      |
| #2   | When OpenRouter is unavailable, returns an invalid-key error, or returns malformed data, the user sees a clear message — not a hang, not a raw 500, not a silent empty result presented as "nothing to review"                 | A 200 response from OpenRouter does not by itself mean valid candidates; "no extractable facts" and "response failed to parse" must be distinguishable                                                                 | The generate route's response contract, the `generation_failed` vs `validation_error` error-code taxonomy, interaction with the config-status banner | unit/integration (mock the OpenRouter HTTP boundary)                                                           | mocking away the JSON-schema parsing/validation logic itself (testing only the happy-path parse)                                                                                                                                                               |
| #3   | A second, different authenticated user can never read, update, or delete the first user's flashcard through the API, even when passing the correct row id                                                                      | DB-level RLS alone is not sufficient proof — the manual-flashcard-management plan already found RLS returns an empty result array (not an error) for someone else's row, which the route layer must translate into 404 | The exact not-found mapping per route, and whether newer routes (e.g. review grading) got the same treatment as the original CRUD routes             | two-tier: (a) real-DB integration test at the **service** layer — two real Supabase-authenticated users, calling `updateFlashcard`/`deleteFlashcard`/`gradeFlashcardReview` directly (they take a plain `SupabaseClient`, no cookies needed) — proves the actual RLS boundary, which no service filters by `user_id` at all (research.md, 2026-09-11); (b) reuse the existing cheap mock-`createClient` route-test pattern (`index.test.ts`) only for the notFound→404 status-code mapping — redundant to also prove that at the real-DB tier | testing only "no auth → 401" without also testing "authenticated but not the owner → 404/403" (the actual IDOR case)                                                                                                                                           |
| #4   | Grading with each of the 4 ratings (Again/Hard/Good/Easy) transitions a card's FSRS state consistent with `ts-fsrs`'s own scheduling semantics — not just "some fields changed"                                                | The DB round-trip (row → typed Card → scheduler → persisted row) is assumed lossless; type/format coercion at the Postgres boundary is exactly where integration bugs hide — specifically, `ts-fsrs`'s `TypeConvert.card()` coerces only `state`/`due`/`last_review` (3 of the 9 persisted fields); `stability`, `difficulty`, `reps`, `lapses`, `scheduled_days`, `learning_steps` pass through **unconverted** (verified in `node_modules/ts-fsrs/dist/index.umd.js`, research.md 2026-09-11) — a prior archived plan's claim that this function "normalizes a raw row" is too broad and must not be re-trusted for those 6 fields | The column-to-Card field mapping in the review service, and whether an out-of-range rating value can reach the grading logic                         | integration (against a real/local Supabase row, not a hand-built Card object — the mapping itself is the risk); assert the 6 uncoerced numeric fields arrive as real JS numbers (`typeof === "number"`) from the fetched row, not just that scheduling "worked" | asserting the exact due-date/stability values `ts-fsrs`'s internal algorithm produces (oracle problem); assert the shape of the transition instead (state changes, due moves forward, reps increments) and treat the library's own correctness as out of scope |
| #5   | An exception thrown by any Supabase Auth SDK call (signup, signin, signout, middleware session resolution) never reaches the client as a raw, unhandled 500                                                                    | The existing wrapper is assumed to cover every current and future auth call site without re-verification                                                                                                               | The exact call sites routed through the existing exception-handling wrapper today, and whether `middleware.ts`'s session resolution uses it too      | unit (force a thrown exception, assert graceful mapping)                                                       | a test that never actually throws (would pass identically even if the try/catch were deleted)                                                                                                                                                                  |
| #6   | Navigating directly to `/dashboard` or `/flashcards` with no session — including right after signing out, or with a stale/invalid session cookie — redirects to `/auth/signin` every time, not just on a fresh unauthenticated visit | Middleware only checks `context.locals.user` truthiness on the SSR request; a raw `fetch`/status-code check proves the *initial* response redirects, but not what a real browser session ultimately renders (client-side navigation or a flash of protected content before redirect would slip through) | The exact `PROTECTED_ROUTES` list vs. the real route tree (does the `startsWith` prefix match cover `/flashcards/generate` and `/flashcards/review` too, or only `/flashcards` itself?), and whether any client-side (non-SSR) navigation path exists that could bypass the middleware | E2E (this is a rendered-page + routing risk — no isolated function proves it; a raw `fetch()`'s redirect status is not the same as what a real browser session renders) | asserting only on the HTTP status/Location header of the initial request instead of the final page a browser actually lands on after following the redirect |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| #   | Phase name                                 | Goal (one line)                                                   | Risks covered | Test types         | Status        | Change folder                                                  |
| --- | ------------------------------------------ | ----------------------------------------------------------------- | ------------- | ------------------ | ------------- | -------------------------------------------------------------- |
| 1   | Bootstrap runner + AI review critical path | Stand up Vitest and defend Risk #1+#2 at the cheapest layer       | #1, #2        | unit + integration | complete      | context/changes/testing-bootstrap-ai-review-critical-path/     |
| 2   | Authorization and data-integrity coverage  | Lock cross-user access boundaries and FSRS grading correctness    | #3, #4        | integration        | complete      | context/changes/testing-authorization-data-integrity-coverage/ |
| 3   | Auth resilience regression guard           | Ensure existing auth-exception hardening doesn't silently regress | #5            | unit               | change opened | context/changes/testing-auth-resilience-regression-guard/      |
| 4   | Quality-gates wiring                       | Wire lint+typecheck+unit/integration as required CI gates         | cross-cutting | gates              | not started   | —                                                              |

**Status vocabulary** (fixed — parser literals): `not started` → `change opened` → `researched` → `planned` → `implementing` → `complete`.

No AI-native/vision-review phase — per interview Q5 (don't overinvest in infrastructure/configuration testing) and no signal that justifies the added cost under cost × signal.

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.

| Layer                | Tool                   | Version                | Notes                                                                                                                                                                                                                                                         |
| -------------------- | ---------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| unit + integration   | Vitest                 | none yet — see Phase 1 | Astro 6 officially recommends Vitest via `getViteConfig()` (confirmed via Context7, `/withastro/docs`, guides/testing.mdx, checked: 2026-09-10). API routes and `src/lib/services/*` are plain TS modules, testable directly without the Astro Container API. |
| API mocking          | none yet — see Phase 1 | —                      | Mock only the OpenRouter HTTP edge for Risk #2; never mock Supabase for Risk #3/#4 integration tests — RLS and FSRS mapping bugs live at that real boundary.                                                                                                  |
| e2e                  | none yet               | —                      | Not scheduled in this rollout — no risk in §2 required promoting past integration, and interview Q5 explicitly asked not to overinvest in infrastructure. Revisit at `--refresh` if a future risk needs full deployed-shape coverage.                         |
| accessibility        | none yet               | —                      | Not scheduled — no risk in §2 traces to an accessibility failure mode.                                                                                                                                                                                        |
| (optional) AI-native | not used               | n/a                    | No AI-native layer in this rollout — see §3 note. When NOT to use: any of these five risks, since each has a deterministic, cheaper classic-layer test.                                                                                                       |

If a row reads "none yet — see Phase <N>", that gap is addressed by the
named rollout phase.

**Stack grounding tools (current session):**

- Docs: Context7 (`/withastro/docs`) — confirmed Astro's official Vitest setup guidance (`getViteConfig()`, Container API scope); checked: 2026-09-10
- Search: Exa.ai — available in this session, not used (Context7's official docs answer was sufficient and preferred over search); checked: 2026-09-10
- Runtime/browser: claude-in-chrome (browser automation) — available, not used; possible future use for a manual smoke pass, not for this rollout's test layers; checked: 2026-09-10
- Provider/platform: none available in current session (no GitHub/Cloudflare/Supabase MCP) — Phase 4's CI-gate wiring will rely on direct edits to `.github/workflows/ci.yml`; checked: 2026-09-10

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required for §3 Phase <N>" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate                        | Where                | Required?                                               | Catches                         |
| --------------------------- | -------------------- | ------------------------------------------------------- | ------------------------------- |
| lint + typecheck            | local + CI           | required (already wired)                                | syntactic / type drift          |
| build                       | local + CI           | required (already wired)                                | build-breaking regressions      |
| unit + integration          | local + CI           | required after §3 Phase 4                               | logic regressions (Risks #1–#5) |
| e2e on critical flows       | —                    | not planned this rollout                                | — (see §4 e2e row)              |
| post-edit hook              | local (agent loop)   | not planned this rollout                                | —                               |
| visual diff (deterministic) | —                    | not planned this rollout                                | —                               |
| multimodal visual review    | —                    | not planned this rollout                                | —                               |
| pre-prod smoke              | between merge + prod | optional (manual, existing practice per archived plans) | environment-specific failures   |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase <N>."

### 6.1 Adding a unit test

- **Service functions that take a Supabase client as a parameter** (e.g. `flashcards.service.ts`): inject a hand-built fake object shaped like the subset of `SupabaseClient` your function touches — do not `vi.mock("@/lib/supabase")` for these; the function never imports the client itself, so there's nothing to mock. See `src/pages/api/flashcards/__tests__/helpers/fake-supabase.ts` for the pattern (a call-counting, in-memory-backed `.from().insert().select().single()` stand-in).
- **A single external HTTP boundary** (e.g. the OpenRouter call in `ai-flashcard-generation.service.ts`): stub `global.fetch` directly via `vi.stubGlobal("fetch", vi.fn())` — no HTTP-mocking library needed for one call site. See `src/lib/services/__tests__/ai-flashcard-generation.service.test.ts`.
- **A module-level constant read from `astro:env/server`** (e.g. `OPENROUTER_API_KEY`): it is frozen at first import, so `vi.stubEnv()` alone does nothing to a test that statically imported the module earlier in the file. Use `vi.resetModules()` + `vi.stubEnv(...)` + a per-test dynamic `await import(...)` instead — see the `loadService()` helper at the top of `ai-flashcard-generation.service.test.ts`.
- See also: §3 Phase 3 (auth-exception pattern — TBD, not yet shipped).

### 6.2 Adding an integration test

- **A route that constructs its own Supabase client internally** (every route under `src/pages/api/` does — `context.locals` only carries `user`, never a client): `vi.mock("@/lib/supabase")` to control `createClient`'s return value, then hand-build a minimal object matching `Parameters<typeof POST>[0]` — typically just `{ locals: { user }, request: new Request(...), cookies: {} as AstroCookies }` cast through `as unknown`. Real `Request` objects (not hand-rolled stubs) let the route's own `request.json()` parsing run for real. See `src/pages/api/flashcards/__tests__/index.test.ts` and `generate.test.ts`.
- **A route that delegates to a service you've already unit-tested** (e.g. `generate.ts` → `generateFlashcardCandidates`): `vi.mock` the service module too, and keep the route test thin — assert only what the route itself owns (auth guard, input validation, status-code mapping), not the service's internal branches. Re-testing already-covered branches at a second layer is the "redundant copies" anti-pattern (see CLAUDE.md's vibe-testing table). See `generate.test.ts`.
- **A React component whose behavior must be proven against a real network payload, not internal state** (the oracle-problem trap — see `research.md`'s Risk #1 verdict for why this matters here): render it for real with `@testing-library/react`, stub `global.fetch`, and assert on the mocked call's URL/method/body or call count. Needs a `// @vitest-environment jsdom` docblock at the top of the file — Vitest 5 removed `environmentMatchGlobs`, so this per-file control comment is the current mechanism, not a global config option. See `src/components/flashcards/__tests__/CandidateCard.test.tsx`.
- **A route that both constructs its own Supabase client AND delegates to a service** (e.g. `[id].ts`, `[id]/review.ts` — most mutating routes do both): mock **both** `@/lib/supabase` (for the 401/500-null-client cases) **and** the service module (for the notFound/error/success mapping cases) in the same test file — one mock alone isn't enough, since the route calls `createClient()` before ever reaching the service. See `src/pages/api/flashcards/__tests__/[id].test.ts` and `.../[id]/review.test.ts`.
- **A boundary only real RLS or a real external library round-trip can prove** (e.g. cross-user access control, or a Postgres-round-tripped value feeding a library like `ts-fsrs`): mocking Supabase can never validate this — the mock returns whatever the test wired it to return regardless of who's asking or what Postgres actually serializes. Call the service function (not the route) directly with a real `@supabase/supabase-js` client authenticated as a real user against local Supabase (`npx supabase start`); see §6.5 for the FSRS-specific pattern and `src/lib/services/__tests__/helpers/real-supabase.ts` for the two-real-user test-fixture helper. These tests live in `*.integration.test.ts` files, excluded from the default `npm test` and run via `npm run test:integration` (package.json).

### 6.3 Adding an e2e test

- Not applicable this rollout — no e2e layer scheduled (see §4).

### 6.4 Adding a test for a new API endpoint

- Follow the §6.2 route-test pattern (mock `@/lib/supabase`, hand-build a minimal context). At minimum, cover: 401 when `locals.user` is absent; 500 when `createClient` returns `null` (missing Supabase env — every route must guard this per `src/lib/supabase.ts`'s documented `null`-on-missing-env contract); 400 for each distinct input-validation failure; the success status and response-body shape; and, if the endpoint persists data, whether a duplicate/replay of the same request is protected against at the server layer or only at the client — don't assume protection exists without a test proving it either way (see `index.test.ts`'s duplicate-save case for the pattern of documenting an absence, not just a presence).
- See also: §3 Phase 2, shipped — the not-found/ownership mapping pattern (RLS returns an empty array, not an error, for rows you don't own): prove the mapping cheaply at the mocked-service route layer (`[id].test.ts`), and prove the RLS boundary itself only at the real-DB service layer (`flashcards.service.integration.test.ts`) — the two are different costs for different claims, don't conflate them into one expensive test.

### 6.5 Adding a test for FSRS/scheduling logic

- Never hand-build a `Card` object to test `review.service.ts`'s grading path — the risk lives in the row↔Card mapping itself (`ts-fsrs`'s `TypeConvert.card()` coerces only `state`/`due`/`last_review`; `stability`/`difficulty`/`reps`/`lapses`/`scheduled_days`/`learning_steps` pass through whatever Postgres actually returns, uncoerced). Create a real flashcard via `createFlashcard`, grade it via `gradeFlashcardReview` with a real authenticated client, then assert on the **re-persisted row**: `state !== State.New`, `due` strictly later, `reps` up by exactly 1, and `typeof` each of the 6 uncoerced fields is `"number"` — never the exact due-date/stability values the algorithm produces (oracle problem, out of scope; `ts-fsrs`'s own correctness isn't this project's to verify).
- To reach a specific starting FSRS state (e.g. a lapse from `Review` to `Relearning`, which a single grade of a brand-new card can't reach), seed it with a real `.update(...)` on the FSRS columns as the owning user before grading — never a hand-built row, and never bypass RLS to do it (the owning user's own client already satisfies `flashcards_update_own`).
- See `src/lib/services/__tests__/review.service.integration.test.ts` for both patterns (parametrized all-4-ratings transition-shape test, and the seeded-relapse test).

### 6.6 Per-rollout-phase notes

- **§3 Phase 1** (`context/changes/testing-bootstrap-ai-review-critical-path/`, shipped): bootstrapped Vitest 5 + `@testing-library/react`. Note the deviation from this plan's original assumption — Astro's documented `getViteConfig()` setup does **not** work in this repo: `@cloudflare/vite-plugin` (pulled in via `astro.config.mjs`'s `adapter: cloudflare()`) rejects Vitest's default SSR `resolve.external` at startup, with no working override found via `getViteConfig()`'s `inlineAstroConfig` argument. `vitest.config.ts` instead hand-rolls the `@/*` alias and stubs `astro:env/server` directly (see `vitest.astro-env-server.stub.ts`) — this sidesteps loading the Cloudflare plugin in the test process entirely. Re-check this if `@cloudflare/vite-plugin` or Vitest release a fix; until then, new env-schema fields must be added to both `astro.config.mjs` and the stub file by hand.

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **UI look-and-feel / visual snapshots** — shadcn/ui components are pre-tested by the library; hand-rolled snapshots would break on every styling tweak and catch nothing. Re-evaluate if a custom, business-logic-bearing visual component is introduced. (Source: Phase 2 interview Q5.)
- **Configuration / infrastructure testing** — not spending rollout budget verifying deploy config, secrets wiring, or CI plumbing beyond what §3 Phase 4 wires as a gate. Re-evaluate if a config-drift incident actually occurs. (Source: Phase 2 interview Q5.)
- **Subjective AI content quality** ("is this a good flashcard?") — judging whether a generated question/answer is pedagogically good is a human/product judgment call, not a deterministic test target; this rollout tests correctness of the pipeline (parsing, persistence, error handling), not content quality. (Source: Phase 2 interview Q5, PRD's own acceptance-rate metric already covers content quality via user judgment.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-09-10
- Stack versions last verified: 2026-09-10
- AI-native tool references last verified: n/a (no AI-native layer in this rollout)
- 2026-09-11: added Risk #6 (§2) out-of-band for the M3L4 `/10x-e2e` course
  exercise — a routing/auth-gate risk covered via **standalone** `/10x-e2e`,
  not a new §3 phase. Not a full `--refresh`; §3/§4/§5's "e2e: not scheduled
  this rollout" stance is otherwise unchanged.

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
