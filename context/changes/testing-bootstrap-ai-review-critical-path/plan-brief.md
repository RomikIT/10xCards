# Bootstrap Vitest and Cover AI Review Critical Path — Plan Brief

> Full plan: `context/changes/testing-bootstrap-ai-review-critical-path/plan.md`
> Research: `context/changes/testing-bootstrap-ai-review-critical-path/research.md`

## What & Why

This project has zero test infrastructure. Rollout Phase 1 of `context/foundation/test-plan.md` stands up Vitest from scratch and uses it to defend the two highest-risk, highest-impact failure scenarios: a user's AI-generated flashcard candidate getting persisted as something other than what they saw (Risk #1), and OpenRouter outages/errors surfacing as a hang or raw error instead of a clear message (Risk #2).

## Starting Point

No `vitest.config.ts`, no test script, no `*.test.ts(x)` files anywhere in the repo. `research.md` grounded both risks in the actual code: most of Risk #1's original worries turned out to already be handled correctly (accept sends exactly what's shown, reject never hits the network, list removal is gated on a real 2xx) — except one confirmed, unmitigated gap: **no server-side protection against a duplicate save**. Risk #2's error taxonomy is thinner than assumed — every OpenRouter-side failure (missing key, invalid key, network error, malformed response) collapses into one generic `generation_failed`/502, which is already non-hanging and already actionable, just untested.

## Desired End State

`npm run test` runs a real Vitest suite covering both risks. A developer can add a new unit test (inject a fake Supabase client) or a new route test (mock `@/lib/supabase`, hand-build a minimal request context) by following the patterns recorded in `test-plan.md` §6. The confirmed duplicate-save gap is pinned by a regression test that documents today's behavior — not silently fixed, so the product decision to add a unique constraint stays a deliberate, separate choice.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Component testing | Render `CandidateCard` with React Testing Library + jsdom | Only way to assert against the real network payload instead of mirroring internal state (oracle problem) | Plan (user-confirmed) |
| Duplicate-save gap | Test only — document, don't fix | Phase 1 is a testing rollout; a schema/idempotency fix is a separate product decision | Plan (user-confirmed) |
| CI wiring | None in this phase | `test-plan.md` §3 Phase 4 owns "Quality-gates wiring" explicitly | Plan (user-confirmed) |
| Error-taxonomy granularity | One `it.each` case per internal failure branch (~7) | Each branch is a different line of code, not a redundant copy — catches distinct regressions | Plan (user-confirmed) |
| Duplicate-click mechanics | Both component-level (fetch called once) and API-level (two rows land) | Proves the working client guard *and* documents the missing server-side guard | Plan (user-confirmed) |
| generate.ts test layering | Service tests own all OpenRouter branches; route tests stay thin (auth/validation/mapping only) | Avoids re-testing the same branches at two layers | Plan (user-confirmed) |
| Supabase mocking strategy | Inject a fake client for service tests; `vi.mock("@/lib/supabase")` only for route tests | Service functions take the client as a parameter — no module mock needed there | Plan (research-grounded) |
| Vitest wiring | `getViteConfig()` from `astro/config`, `environmentMatchGlobs` for jsdom on `.test.tsx` only | Astro's official pattern (confirmed via Context7); avoids paying jsdom cost for non-component tests | Plan (research-grounded) |

## Scope

**In scope:**
- Vitest + React Testing Library bootstrap, with explicit verification that `astro:env/server` and `@/*` aliases resolve in the test process
- `CandidateCard` component tests (accept as-is, accept-after-edit, reject, double-click)
- `POST /api/flashcards` route tests (auth, validation, success, duplicate-save regression pin)
- `generateFlashcardCandidates` service tests (7 failure branches + empty-success distinction, via `it.each`)
- `POST /api/flashcards/generate` route tests (auth, validation, error/success mapping — service mocked)
- `test-plan.md` §6.1/§6.2/§6.4 cookbook update

**Out of scope:**
- Fixing the duplicate-save gap (unique constraint / idempotency key)
- CI wiring (`ci.yml`) — deferred to rollout Phase 4
- Per-candidate silent-filter edge case (a separate, smaller data-quality gap noted in research but not part of Risk #2's stated scope)
- Risk #3 (cross-user access) and Risk #4 (FSRS grading) — rollout Phase 2, a separate change folder, and require real Supabase/RLS per `test-plan.md` §4

## Architecture / Approach

Two independent test boundaries: (1) the OpenRouter HTTP edge, stubbed via `vi.stubGlobal("fetch", ...)` since there's no separate client module to mock; (2) the Supabase client, either injected directly (service-layer functions take it as a parameter) or mocked at the module boundary (`@/lib/supabase`) for route-layer tests, since routes construct their own client internally. Component tests render real React code against a mocked `fetch`, asserting on the dispatched network call rather than component state.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Vitest Bootstrap | Runnable `npm run test`, verified env/alias resolution | `astro:env/server` might not resolve as documented in the Node test process — first test empirically confirms this rather than assuming |
| 2. Risk #1 — CandidateCard tests | Accept/edit/reject/double-click regression guards | None significant — behavior already confirmed correct by research |
| 3. Risk #1 — POST /api/flashcards route tests | Auth/validation regression + duplicate-save gap documented | Test must assert on persisted-row count, not UI-visible success, to avoid the oracle-problem trap |
| 4. Risk #2 — generateFlashcardCandidates tests | All 7 failure branches + empty-success distinction pinned | None significant — service already deterministic and mockable |
| 5. Risk #2 — POST /api/flashcards/generate route tests | Thin auth/validation/mapping coverage, no branch duplication | Must mock the service module, not `fetch`, to stay thin |
| 6. Cookbook update | `test-plan.md` §6.1/§6.2/§6.4 filled in | Must not touch §1/§2 (frozen outside `--refresh`) |

**Prerequisites:** None — greenfield test infrastructure, no dependency on other rollout phases.
**Estimated effort:** ~1 session across 6 phases (bootstrap + 5 focused test files + a documentation update).

## Open Risks & Assumptions

- Assumes `getViteConfig()` correctly carries `astro:env/server` and `@/*` alias resolution into the Vitest process — Phase 1's bootstrap test is designed specifically to surface a failure here early, with a documented fallback (`.env.test` / `vite-tsconfig-paths`) if it doesn't.
- Assumes React 19 + `@testing-library/react@^16` interoperate cleanly — this is a well-established compatible pairing but not yet verified in this specific repo.

## Success Criteria (Summary)

- `npm run test` runs a real suite (not a vacuous "0 tests" pass) covering both Risk #1 and Risk #2, with the confirmed duplicate-save gap explicitly pinned rather than silently absent.
- A developer unfamiliar with this phase can read `test-plan.md` §6 and correctly add a new unit or route test without re-deriving the Supabase-mocking or `fetch`-stubbing decisions from scratch.
- `npm run build`, `npm run lint`, and `npm run typecheck` remain green throughout — the test bootstrap introduces zero production-path regressions.
