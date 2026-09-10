# Bootstrap Vitest and Cover AI Review Critical Path — Implementation Plan

## Overview

Stand up Vitest from a clean slate (no test infrastructure exists anywhere in this repo) and defend rollout Phase 1's two risks at the cheapest layer that gives real signal: Risk #1 (candidate accept/edit/reject persistence mismatch — one confirmed, unmitigated gap: no server-side duplicate-save protection) and Risk #2 (OpenRouter unavailable/invalid-key/malformed-data handling — a thinner error taxonomy than originally assumed, but already non-hanging and already actionable).

## Current State Analysis

- **No test infrastructure exists**: no Vitest/Jest config, no `test` script in `package.json`, zero `*.test.ts(x)` files anywhere (`research.md` §Summary, confirmed via repo-wide search).
- **Risk #1 is mostly already correct**: `CandidateCard.tsx`'s `handleAccept` (`src/components/flashcards/CandidateCard.tsx:51-71`) sends exactly the on-screen `question`/`answer` state, `handleReject` (`:73-75`) never touches the network, and list removal only happens after a confirmed 2xx (`:62-65`). The one real, unmitigated gap: `isSubmitting`/`disabled` (`:37, 54, 109`) is a client-only guard; `POST /api/flashcards` → `createFlashcard` (`src/lib/services/flashcards.service.ts:27-43`) does a plain insert with no unique constraint or idempotency key (confirmed absent in `supabase/migrations/20260909090431_create_flashcards_table.sql:5-14`).
- **Risk #2's real taxonomy is 3 codes, not more**: `unauthorized` (401), `validation_error` (400), `generation_failed` (502, catch-all for 7 distinct internal failure branches in `src/lib/services/ai-flashcard-generation.service.ts`: missing key `:63-66`, network/timeout `:69-89`, non-ok OpenRouter response `:91-98`, invalid envelope JSON `:100-106`, missing/wrong-type content `:108-112`, unparseable inner JSON `:114-120`, non-array candidates `:122-125`). A hard 20s timeout (`AbortSignal.timeout`, `:10, 84`) already rules out an infinite hang. An empty-but-valid AI result (`candidates: []`) already returns 200, distinct from any parse/shape failure (502) — structurally correct today, just unverified by any test.
- **Route handlers construct their own Supabase client**: `context.locals` carries only `user` (`src/middleware.ts:6-14`); `POST /api/flashcards` and `POST /api/flashcards/generate` each call `createClient(context.request.headers, context.cookies)` independently (`src/pages/api/flashcards/index.ts:34`). This means route-level tests must mock the `@/lib/supabase` module; **service-level tests do not** — `flashcards.service.ts`'s functions take the Supabase client as a parameter, so a hand-built fake object can be passed directly with no module mocking.
- **No separate OpenRouter client module** — everything lives in `ai-flashcard-generation.service.ts`. Mock `global.fetch` directly; no MSW needed for a single call site.
- **No `getViteConfig()` wired yet** in `astro.config.mjs`. Astro's official guidance (confirmed via Context7, `/withastro/docs`, `guides/testing.mdx`) is to import `getViteConfig` from `astro/config` in `vitest.config.ts` — this automatically resolves the `astro:env/server` virtual module and any `@/*` tsconfig-path aliases, since it loads the full merged Astro Vite config.

### Key Discoveries:

- `context/foundation/test-plan.md` §2's original Risk #2 framing ("invalid-key error" as a distinct branch, a `src/lib/openrouter.ts` client module) does not match the implementation — `research.md` already corrected this; this plan tests the *actual* collapsed behavior, not the assumed taxonomy.
- `mapError` (`flashcards.service.ts:7-13`) and `isValidCandidate`/`safeReadText` (`ai-flashcard-generation.service.ts:135-156`) are private, non-exported helpers — only testable indirectly through the public functions that call them.
- `src/types.ts`'s `Flashcard` interface carries FSRS fields (`due`, `stability`, etc.) absent from the current migration — a schema/type drift relevant to a later rollout phase (Risk #4), explicitly out of scope here.

## Desired End State

Vitest is runnable via `npm run test`, with a `vitest.config.ts` that resolves `astro:env/server` and `@/*` aliases correctly. Five new test files exist, each asserting behavior grounded in `research.md`, none mirroring implementation logic. `context/foundation/test-plan.md` §6.1, §6.2, and §6.4 name the concrete patterns shipped. `change.md` status is `planned`.

**Verification**: `npm run test` passes; `npm run typecheck`/`npm run lint` pass on all new files; manually confirm each new test fails when its guarded behavior is deliberately broken (spot-checked during implementation, not part of the committed suite).

### Key Discoveries:

- Vitest 6's Container API requires `environment: "node"` for rendering Astro components (Context7, `guides/upgrade-to/v6.mdx`) — not relevant here since no `.astro` component is under test, but confirms `node` is the correct *default* environment; component-level React tests need `jsdom` scoped per-file via `environmentMatchGlobs`, not globally.
- `@testing-library/react` must be a version supporting React 19 (`^19.2.6` installed) — v16+.

## What We're NOT Doing

- Not adding a unique constraint, idempotency key, or any other fix for the confirmed duplicate-save gap — Phase 6 (per the phased rollout `- [ ]` risk-response guidance) only *documents* current behavior via a regression test; a fix is a separate product decision.
- Not wiring CI (`.github/workflows/ci.yml`) to run these tests — that is `test-plan.md` §3 Phase 4's explicit job ("Quality-gates wiring"); this phase adds a local `test` script only.
- Not testing the per-candidate silent-filter behavior (`isValidCandidate` dropping one malformed candidate from an otherwise-valid array) — `research.md` flagged this as a real but separate data-quality gap, out of Risk #2's stated scope.
- Not touching Risk #3 (cross-user access) or Risk #4 (FSRS grading) — those are rollout Phase 2, a separate change folder, and explicitly require real Supabase/RLS (not mocks) per `test-plan.md` §4's Stack guidance.
- Not adding MSW or any HTTP-mocking library — a single `fetch` call site is cheaper to stub directly via `vi.stubGlobal`/`vi.fn()`.
- Not adding `@vitest/ui` or coverage reporting — no signal requirement for either in this phase; can be added later without churn.

## Implementation Approach

Bootstrap first (nothing else can run without it), then attack Risk #1 before Risk #2 per priority (Risk #1 has the one confirmed live gap; Risk #2 is mostly "verify existing correct behavior"). Within each risk, component/service-level (cheaper, more isolated) precedes route-level (thinner, asserts only what the route itself owns — auth, validation, status mapping — to avoid the "redundant copies" anti-pattern of re-testing already-covered branches).

## Critical Implementation Details

### `astro:env/server` resolution in the test process

Astro's env schema (`astro.config.mjs:17-23`) declares all three secrets as `optional: true`, so `SUPABASE_URL`/`SUPABASE_KEY`/`OPENROUTER_API_KEY` resolve to `undefined` when unset rather than throwing at config-validation time — this is what makes `supabase.ts`'s `null`-return branch and the generation service's "missing key" branch reachable in tests. However, in production this project reads secrets via the Cloudflare adapter's runtime bindings, not bare `process.env`; in the Vitest/Node process there is no Cloudflare runtime, so `astro:env/server`'s resolution path falls back to whatever `getViteConfig()`'s Vite context exposes. **Phase 1's first real test must empirically confirm** that `vi.stubEnv("OPENROUTER_API_KEY", "test-key")` (and unset via `vi.unstubAllEnvs()`) actually changes what `ai-flashcard-generation.service.ts` and `supabase.ts` observe when imported inside a test file — do not assume this works from documentation alone; if it does not, the fallback is stubbing via a `.env.test` file loaded by Vite's own mode handling (Context7, `guides/environment-variables.mdx`, `.env.<mode>` convention) with `vitest` invoked in a `test` mode.

### `@/*` alias resolution via `getViteConfig()`

`astro.config.mjs` does not explicitly configure `vite.resolve.alias` for `@/*` — it works today only because Astro's own tooling reads `tsconfig.json`'s `paths`. `getViteConfig()` is documented to load the full Astro-merged Vite config, which should carry this resolution into Vitest, but this must also be confirmed by the first bootstrap test importing something via the `@/*` alias. If it fails, add `vite-tsconfig-paths` as an explicit Vite plugin in `vitest.config.ts` rather than hand-rolling an alias map.

## Phase 1: Vitest Bootstrap

### Overview

Install Vitest and its React/DOM testing companions, wire `vitest.config.ts` through `getViteConfig()`, add the `test` npm script, and prove the two load-bearing resolution paths (env, alias) actually work before any risk-specific test is written.

### Changes Required:

#### 1. Test dependencies

**File**: `package.json`

**Intent**: Add the minimum dependency set to run Vitest against this Astro + React 19 + Cloudflare project: the runner itself, a DOM environment for component tests, React Testing Library (React 19-compatible) for rendering `CandidateCard`, and a `test` script.

**Contract**: Add to `devDependencies`: `vitest`, `jsdom`, `@testing-library/react` (`^16`, React 19 support), `@testing-library/jest-dom`, `@testing-library/user-event`. Add script `"test": "vitest run"` (and optionally `"test:watch": "vitest"` for local dev — implementer's call, not load-bearing).

#### 2. Vitest configuration

**File**: `vitest.config.ts` (new, repo root)

**Intent**: Wire Vitest through Astro's official `getViteConfig()` so the Astro Vite plugin chain (env virtual module, `@/*` alias, Tailwind plugin, etc.) applies to the test process, default to the lighter `node` environment, and scope `jsdom` only to component test files.

**Contract**: Import `getViteConfig` from `astro/config`. Set `test.environment: "node"` as the default and `test.environmentMatchGlobs: [["**/*.test.tsx", "jsdom"]]` so `.test.ts` files (services, routes) stay on `node` and `.test.tsx` files (React components) get `jsdom`. Set `test.setupFiles` to point at a new setup file (see next item). No code snippet needed — this is a direct application of the Context7-confirmed pattern:

```ts
/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

export default getViteConfig({
  test: {
    environment: "node",
    environmentMatchGlobs: [["**/*.test.tsx", "jsdom"]],
    setupFiles: ["./vitest.setup.ts"],
  },
});
```

#### 3. Test setup file

**File**: `vitest.setup.ts` (new, repo root)

**Intent**: Register `@testing-library/jest-dom`'s matchers globally so component tests can use `toBeInTheDocument()`, `toBeDisabled()`, etc.

**Contract**: `import "@testing-library/jest-dom/vitest";` — single line, no other setup needed for this phase (no global fetch polyfill required; Node 22's native `fetch` covers `AbortSignal.timeout` and the service's own `fetch` calls, and each risk-specific test stubs `global.fetch` itself).

#### 4. Bootstrap verification test

**File**: `src/lib/__tests__/bootstrap.test.ts` (new)

**Intent**: Prove — not assume — that the two load-bearing resolution paths from "Critical Implementation Details" actually work, before any risk-specific test depends on them. This doubles as the first real regression test for `supabase.ts`'s documented `null`-on-missing-env contract (CLAUDE.md: "callers... check for `null` and degrade gracefully").

**Contract**: Import `createClient` from `@/lib/supabase` (proves alias resolution). One case with `SUPABASE_URL`/`SUPABASE_KEY` unset (via `vi.stubEnv` + `vi.unstubAllEnvs()` in `afterEach`, or by simply not stubbing them, since the ambient test environment shouldn't have them set) asserts `createClient(...)` returns `null` — proves both alias resolution and confirms whether `vi.stubEnv` is the correct mechanism for controlling `astro:env/server`-backed values in this test process (if this assertion requires a different mechanism to pass, that is the concrete signal to fall back to `.env.test`, per the Critical Implementation Details note above).

### Success Criteria:

#### Automated Verification:

- `npm install` completes with new devDependencies present in `package.json`/lockfile
- `npm run test` executes and passes (`vitest.config.ts` loads without error, `bootstrap.test.ts` passes)
- `npm run typecheck` passes (no type errors introduced by `vitest.config.ts`/`vitest.setup.ts`)
- `npm run lint` passes on all new files

#### Manual Verification:

- Confirm in the test output that `bootstrap.test.ts` actually exercised the `null`-return branch (not skipped/vacuous) — read the assertion result, not just "0 failures"
- Confirm `npm run build` still succeeds (new devDependencies and `vitest.config.ts` must not interfere with the production Astro/Cloudflare build)

---

## Phase 2: Risk #1 — CandidateCard Component Tests

### Overview

Render `CandidateCard` with React Testing Library and assert against the actual network payload and call count — never against the component's internal state — per `research.md`'s anti-oracle-problem guidance.

### Changes Required:

#### 1. CandidateCard behavior tests

**File**: `src/components/flashcards/__tests__/CandidateCard.test.tsx` (new)

**Intent**: Lock in the three already-correct behaviors as regression guards, and prove the client-side double-submit guard works — each case asserts against the mocked `fetch` call (URL, method, body) or call count, not against React internal state or DOM text alone.

**Contract**: Stub `global.fetch` per test (`vi.fn()` resolving a `Response`-like object). Cases:
- *Accept as-is*: render with a `candidate` prop, click "Accept" without editing, assert `fetch` was called once with `POST /api/flashcards` and a JSON body exactly `{ question: candidate.question, answer: candidate.answer }`.
- *Accept after edit*: click "Edit", change both textareas via `userEvent.type`/`clear`+`type`, click "Accept", assert the `fetch` body reflects the **edited** text, not the original `candidate.question`/`candidate.answer` — this is the regression guard research.md called out as worth pinning even though no live bug exists today.
- *Reject*: click "Reject", assert `fetch` was **never** called (`expect(fetch).not.toHaveBeenCalled()`), and assert the `onRejected` callback prop fired.
- *Double-click on Accept*: click "Accept" twice in rapid succession (before the mocked fetch promise resolves — use a fetch mock that returns a pending/deferred promise until explicitly resolved) and assert `fetch` was called **exactly once** — proves `isSubmitting`/`disabled` (`CandidateCard.tsx:37,54,109`) actually blocks the second click at the UI layer.

Anti-pattern avoided: none of these assert on `question`/`answer` React state directly (the oracle-problem trap `research.md` flagged) — all assert on the actually-dispatched network call.

### Success Criteria:

#### Automated Verification:

- `npm run test -- CandidateCard` passes all four cases
- `npm run typecheck` passes
- `npm run lint` passes

#### Manual Verification:

- Temporarily comment out the `disabled={!canAccept}` guard in `CandidateCard.tsx`, re-run the double-click test, confirm it fails (proves the test actually catches the regression it claims to catch) — then revert the comment-out before committing.

---

## Phase 3: Risk #1 — POST /api/flashcards Route Tests

### Overview

Test the route handler directly (no HTTP server spin-up) by importing the exported `POST`/`GET` `APIRoute` functions and invoking them with a hand-built `APIContext`. Mock `@/lib/supabase`'s `createClient` since the route constructs its own client internally. Document the confirmed duplicate-save gap as a regression-pinning test, not a bug report.

### Changes Required:

#### 1. Fake Supabase client test helper

**File**: `src/pages/api/flashcards/__tests__/helpers/fake-supabase.ts` (new)

**Intent**: A minimal, call-counting stand-in for the Supabase client's `.from(table).insert(row).select().single()` chain, shared by this phase's tests. Not a general-purpose Supabase mock — only the methods `createFlashcard`/the route actually call.

**Contract**: A factory function returning an object shaped like the subset of `SupabaseClient` the route path touches, backed by an in-memory array so multiple inserts are individually observable (call count, resulting row count) — exact shape left to the implementer since it's a straightforward test double, not a load-bearing design decision.

#### 2. Route-level tests

**File**: `src/pages/api/flashcards/__tests__/index.test.ts` (new)

**Intent**: Assert the auth/validation/mapping contract already implemented, plus the priority test — two direct sequential POSTs with identical bodies both succeed and produce two distinct persisted rows, proving the absence of server-side duplicate protection.

**Contract**: `vi.mock("@/lib/supabase")` to control `createClient`'s return value per test (the fake client from helper #1, or `null` to hit the 500 branch). Build a minimal `APIContext`-shaped object: `{ locals: { user: { id: "test-user" } | null }, request: new Request(...), cookies: <unused stub, since createClient is mocked and ignores it> }`. Cases:
- 401 when `locals.user` is absent
- 500 `internal_error` when the mocked `createClient` returns `null`
- 400 `validation_error` for invalid JSON body, and for `question`/`answer` failing the length check
- 201 success on valid input, response body contains the fake-persisted flashcard
- **Priority case**: two sequential calls to the exported `POST` handler with byte-identical valid bodies and the same mocked user both resolve 201, and the fake Supabase helper's insert-call-count is 2 with two distinct row ids — this is the regression pin for the confirmed gap, phrased as "this is what happens today," not "this should never happen."

Anti-pattern avoided: the priority case asserts against the persistence layer's actual insert count, not against UI-level absence of an error (the oracle-problem trap for this specific risk, per `research.md`'s Risk #1 verdict).

### Success Criteria:

#### Automated Verification:

- `npm run test -- flashcards/index` passes all cases including the duplicate-save regression pin
- `npm run typecheck` passes
- `npm run lint` passes

#### Manual Verification:

- Confirm the duplicate-save test is documented with a comment linking to `research.md`'s Risk #1 finding, so a future reader understands why the assertion is "two rows land" rather than "should be rejected" (prevents the test being mistaken for a bug in the test itself).

---

## Phase 4: Risk #2 — generateFlashcardCandidates Service Tests

### Overview

Unit-test the service function directly (no route/auth boilerplate) by stubbing `global.fetch`, covering every distinct internal failure branch plus the empty-success distinction — each branch is a genuinely different line of code, not a redundant copy.

### Changes Required:

#### 1. Service-level error-taxonomy tests

**File**: `src/lib/services/__tests__/ai-flashcard-generation.service.test.ts` (new)

**Intent**: Prove that all seven distinct internal failure paths collapse to the same `{ error: { code: "generation_failed", message: ... } }` shape (the actual current behavior, per `research.md`'s corrected taxonomy — not the richer taxonomy the original test-plan assumed), and that a legitimate empty result is structurally distinct (200-shaped success, not an error).

**Contract**: Use `vi.stubGlobal("fetch", vi.fn())` per test, with `vi.stubEnv("OPENROUTER_API_KEY", "test-key")` where the branch requires a key to be present (all except the missing-key case). Use `it.each` with one row per branch so each failure mode is traceable to the exact line it guards:

| Case | Fetch stub behavior | Asserts |
|---|---|---|
| Missing API key | n/a (`vi.stubEnv` unset) | `{ error: GENERATION_FAILED shape }`, `fetch` never called |
| Network/timeout error | `fetch` rejects | same error shape |
| Non-ok HTTP status (e.g. 401) | resolves `{ ok: false, status: 401 }` | same error shape |
| Invalid envelope JSON | resolves `{ ok: true, json: () => Promise.reject(...) }` | same error shape |
| Missing/non-string `choices[0].message.content` | resolves valid envelope, malformed `choices` | same error shape |
| Unparseable inner JSON | resolves envelope with non-JSON `content` string | same error shape |
| Non-array `candidates` | resolves envelope with `content: '{"candidates": "not-an-array"}'` | same error shape |
| Legitimate empty result | resolves envelope with `content: '{"candidates": []}'` | `{ data: [] }` — success shape, no error, distinguishes from the row above |

Every row asserts the **exact** returned `ServiceError` object (`code: "generation_failed"`) — since all seven collapse to the identical shape, this itself is the regression signal: if a future refactor accidentally changes one branch's error shape without changing the others, the `it.each` table catches the divergence immediately.

Anti-pattern avoided: not asserting a taxonomy split (e.g. a distinct code for invalid-key vs network error) that doesn't exist in the implementation — `research.md` explicitly flagged this as the original test-plan's incorrect assumption.

### Success Criteria:

#### Automated Verification:

- `npm run test -- ai-flashcard-generation.service` passes all 8 `it.each` rows
- `npm run typecheck` passes
- `npm run lint` passes

#### Manual Verification:

- Spot-check one row (e.g., non-array `candidates`) by temporarily breaking its guard clause in the service and confirming the corresponding test row fails while the others stay green — proves row-level isolation, not just aggregate pass/fail.

---

## Phase 5: Risk #2 — POST /api/flashcards/generate Route Tests

### Overview

Thin route-level tests asserting only what the route itself owns — auth guard, input-length validation, and `{error} → 502` / `{data} → 200` mapping — with the service module mocked so none of Phase 4's branches are re-exercised here.

### Changes Required:

#### 1. Route-level tests

**File**: `src/pages/api/flashcards/__tests__/generate.test.ts` (new)

**Intent**: Cover the route's own contract without duplicating Phase 4's OpenRouter-branch coverage.

**Contract**: `vi.mock("@/lib/services/ai-flashcard-generation.service")` to control `generateFlashcardCandidates`'s return value directly (bypass `fetch` entirely at this layer). Cases:
- 401 when `locals.user` is absent
- 400 `validation_error` for missing/non-string `text`, `text` under `MIN_INPUT_LENGTH` (20), and `text` over `MAX_INPUT_LENGTH` (10000)
- 502 when the mocked service returns `{ error: ... }`, response body is exactly `{ error: result.error }`
- 200 when the mocked service returns `{ data: [...] }`, response body is `{ candidates: result.data }`

### Success Criteria:

#### Automated Verification:

- `npm run test -- flashcards/generate` passes all cases
- `npm run typecheck` passes
- `npm run lint` passes

#### Manual Verification:

- Confirm via test output (or a quick `vi.mocked(generateFlashcardCandidates).mock.calls`) that the service mock was actually invoked with the trimmed `text` — proves the route's validation-then-delegate contract, not just its own status-mapping.

---

## Phase 6: Cookbook Update

### Overview

Close the loop on `context/foundation/test-plan.md` — record the concrete patterns this phase shipped so a future contributor adding a test in this area doesn't rediscover the same decisions (fake Supabase client vs module mock, `environmentMatchGlobs`, `it.each` for taxonomy branches).

### Changes Required:

#### 1. Cookbook sections

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the `TBD` placeholders in §6.1, §6.2, and §6.4 with concrete, file-path-referenced patterns from this phase. Do not touch §1/§2 (frozen outside `--refresh`, per the orchestrator's rules) or any other §6 subsection this phase didn't touch (§6.3 e2e, §6.5 FSRS stay `TBD`/`Not applicable`).

**Contract**:
- §6.1 (unit test): name the "inject the client, don't mock the module" pattern for service functions (`flashcards.service.ts`'s functions take `supabase` as a parameter) vs. "stub `global.fetch`" for the OpenRouter boundary (`ai-flashcard-generation.service.ts`), pointing at `src/lib/services/__tests__/ai-flashcard-generation.service.test.ts` as the reference.
- §6.2 (integration/route test): name the "mock `@/lib/supabase`'s `createClient`, hand-build a minimal `APIContext`" pattern, pointing at `src/pages/api/flashcards/__tests__/index.test.ts` and `generate.test.ts`.
- §6.4 (new API endpoint): point at the same route-test pattern plus the auth/validation/mapping case list from Phase 3/5 as the checklist a new endpoint's tests should follow.
- Add one line to §6.6 (per-rollout-phase notes) summarizing what Phase 1 shipped and linking to this change folder.

#### 2. Change status

**File**: `context/changes/testing-bootstrap-ai-review-critical-path/change.md`

**Intent**: Mark the change complete once all five preceding phases are done.

**Contract**: Set `status: implemented` (or the project's terminal pre-archive status) and `updated: <date>`.

### Success Criteria:

#### Automated Verification:

- `npm run test` (full suite) passes
- `npm run typecheck` passes
- `npm run lint` passes
- `npm run build` still succeeds

#### Manual Verification:

- Read §6.1/§6.2/§6.4 back and confirm a future contributor unfamiliar with this phase could follow them to add a new test without re-reading this plan
- Confirm §1/§2/§3/§4/§5/§6.3/§6.5/§7/§8 of `test-plan.md` are byte-identical to before this phase except for the §3 status cell (updated separately by the `/10x-test-plan` orchestrator once it re-reads this plan's `## Progress`, not by this phase directly)

---

## Testing Strategy

### Unit Tests:

- `generateFlashcardCandidates` — all 7 failure branches + empty-success distinction (Phase 4)
- `createClient`'s `null`-on-missing-env branch (Phase 1, bootstrap verification)

### Integration Tests:

- `POST /api/flashcards` — auth/validation/success/duplicate-save-gap (Phase 3)
- `POST /api/flashcards/generate` — auth/validation/error-mapping/success (Phase 5)
- `CandidateCard` component — accept/edit/reject/double-click (Phase 2) — classified as integration-level since it renders real component code against a mocked network boundary, not a pure function

### Manual Testing Steps:

1. Run `npm run dev`, navigate to `/flashcards/generate`, paste study text, generate candidates, accept one — confirm it appears in the flashcard list (sanity check that the mocked-test contracts match real behavior).
2. Temporarily unset `OPENROUTER_API_KEY` in `.dev.vars`, repeat generation — confirm the UI shows the generic error message, not a hang or raw error (manual cross-check of Phase 4/5's assumptions against the real dev server).

## Performance Considerations

None — this phase adds no production code paths, only test infrastructure and test files.

## Migration Notes

Not applicable — no data migration in this phase (the duplicate-save gap is deliberately left unfixed per the "What We're NOT Doing" section).

## References

- Research: `context/changes/testing-bootstrap-ai-review-critical-path/research.md`
- Rollout context: `context/foundation/test-plan.md` §3 Phase 1
- Astro Vitest setup guidance: Context7 `/withastro/docs`, `guides/testing.mdx` (confirmed 2026-09-10)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Vitest Bootstrap

#### Automated

- [x] 1.1 `npm install` completes with new devDependencies present — f3c90f3
- [x] 1.2 `npm run test` executes and passes — f3c90f3
- [x] 1.3 `npm run typecheck` passes — f3c90f3
- [x] 1.4 `npm run lint` passes on all new files — f3c90f3

#### Manual

- [x] 1.5 Confirm `bootstrap.test.ts` exercised the `null`-return branch (not vacuous) — f3c90f3
- [x] 1.6 Confirm `npm run build` still succeeds — f3c90f3

### Phase 2: Risk #1 — CandidateCard Component Tests

#### Automated

- [x] 2.1 `npm run test -- CandidateCard` passes all four cases — dee4d32
- [x] 2.2 `npm run typecheck` passes — dee4d32
- [x] 2.3 `npm run lint` passes — dee4d32

#### Manual

- [x] 2.4 Break the `disabled` guard, confirm the double-click test fails, then revert — dee4d32

### Phase 3: Risk #1 — POST /api/flashcards Route Tests

#### Automated

- [x] 3.1 `npm run test -- flashcards/index` passes all cases including the duplicate-save regression pin — 73f6a4a
- [x] 3.2 `npm run typecheck` passes — 73f6a4a
- [x] 3.3 `npm run lint` passes — 73f6a4a

#### Manual

- [x] 3.4 Confirm the duplicate-save test is documented with a comment linking to `research.md` — 73f6a4a

### Phase 4: Risk #2 — generateFlashcardCandidates Service Tests

#### Automated

- [x] 4.1 `npm run test -- ai-flashcard-generation.service` passes all 8 `it.each` rows — 5a76d67
- [x] 4.2 `npm run typecheck` passes — 5a76d67
- [x] 4.3 `npm run lint` passes — 5a76d67

#### Manual

- [x] 4.4 Spot-check row-level isolation by breaking one guard clause — 5a76d67

### Phase 5: Risk #2 — POST /api/flashcards/generate Route Tests

#### Automated

- [x] 5.1 `npm run test -- flashcards/generate` passes all cases — 8e6ec1b
- [x] 5.2 `npm run typecheck` passes — 8e6ec1b
- [x] 5.3 `npm run lint` passes — 8e6ec1b

#### Manual

- [x] 5.4 Confirm the service mock was invoked with trimmed `text` — 8e6ec1b

### Phase 6: Cookbook Update

#### Automated

- [x] 6.1 `npm run test` (full suite) passes
- [x] 6.2 `npm run typecheck` passes
- [x] 6.3 `npm run lint` passes
- [x] 6.4 `npm run build` still succeeds

#### Manual

- [x] 6.5 Read §6.1/§6.2/§6.4 back for a future-contributor sanity check
- [x] 6.6 Confirm no unintended edits landed outside §6 and §3's status cell
