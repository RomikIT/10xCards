# Spaced-Repetition Review Session — Plan Brief

> Full plan: `context/changes/spaced-repetition-review-session/plan.md`
> Research: `context/changes/spaced-repetition-review-session/research.md`

## What & Why

Ship S-04: a review session where due flashcards are served via `ts-fsrs` (FSRS v6) and the user grades recall to update the schedule. This is the roadmap's north star — the spaced-repetition engine is the second half of the product's value proposition, alongside the already-shipped AI-generation loop.

## Starting Point

`flashcards` (F-01) has only 6 columns (question, answer, owner, timestamps) — no scheduling state. `ts-fsrs` is confirmed Cloudflare-Workers-compatible and not yet installed. Existing CRUD service/API/page patterns are well-established and directly reusable (`flashcards.service.ts`, `/api/flashcards/*`, `flashcards.astro` + `flashcards/generate.astro`).

## Desired End State

A signed-in user visits `/flashcards/review`, sees the next due card, reveals the answer, grades it (Again/Hard/Good/Easy), and the app moves to the next due card — persisting the new FSRS schedule each time. An empty queue shows a clear "all caught up" state.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Review history | No `review_logs` table | Not required for FR-009/FR-010; `ReviewLog` is explicitly optional per the ts-fsrs docs | Plan (user-confirmed) |
| Existing-card migration | Default to `state=New`, `due=now()` | Mirrors `createEmptyCard()` exactly — zero backfill logic, no card left stateless | Plan (user-confirmed) |
| Grading granularity | Full 4-level `Rating` (Again/Hard/Good/Easy) | Matches ts-fsrs's native semantics with zero information loss to the algorithm | Plan (user-confirmed) |
| Session size | No cap — all due cards | Simplest implementation; MVP data volumes are trivial | Plan (user-confirmed) |
| Routing | Dedicated `/flashcards/review` page | Auto-protected by existing `PROTECTED_ROUTES` prefix match; matches the `flashcards/generate` sibling-page precedent | Plan (user-confirmed) |
| FSRS scheduler config | Library defaults (`fsrs()` with no options) | Already tuned for 90% retention; no data yet to justify custom tuning | Plan (user-confirmed) |
| Library | `ts-fsrs` | Confirmed Cloudflare Workers + Node-engine compatible, most maintained option surveyed | Research |

## Scope

**In scope:**
- Additive migration: FSRS state columns on `flashcards` (`due`, `stability`, `difficulty`, `state`, `reps`, `lapses`, `scheduled_days`, `learning_steps`, `last_review`)
- `review.service.ts` wrapping `ts-fsrs` (due-queue query + grading transition)
- `GET /api/flashcards/review` (due queue), `POST /api/flashcards/[id]/review` (grade)
- `/flashcards/review` page + `ReviewSession` React component
- `formatDate()` helper in `src/lib/utils.ts`

**Out of scope:**
- Review-history/audit table
- Session size limits/pagination
- Custom FSRS scheduler parameters
- Simplified/binary rating UX
- Explicit "activate" step for pre-existing cards

## Architecture / Approach

One additive Postgres migration extends `flashcards` with FSRS columns defaulted to match a freshly-created card. `review.service.ts` follows the same tagged-union return convention as `flashcards.service.ts`, converting DB rows to/from `ts-fsrs`'s `Card` shape via `TypeConvert.card()`. Two new API routes mirror the existing handler skeleton exactly. The UI follows the existing SSR-fetch + React-island pattern (`flashcards.astro` → `FlashcardManager`), adding a new sibling page/island pair for the review flow.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema, dependency, types | `ts-fsrs` installed; `flashcards` extended with FSRS columns; types updated | Column defaults must exactly match `createEmptyCard()` output or cards behave inconsistently |
| 2. Review service | `listDueFlashcards()` / `gradeFlashcardReview()` wrapping `ts-fsrs` | Row↔`Card` conversion via `TypeConvert.card()` must round-trip correctly |
| 3. Review API endpoints | `GET`/`POST` routes for queue + grading | None significant — mirrors existing, proven handler pattern |
| 4. Review session UI | `/flashcards/review` page + `ReviewSession` component | Empty-queue and last-card transitions are the main UX edge cases to get right |

**Prerequisites:** F-01 (shipped), S-02 (shipped) — both prerequisites' plans are already 100% complete despite roadmap showing stale `in-progress` status.
**Estimated effort:** ~1-2 sessions across 4 phases (small, well-precedented codebase).

## Open Risks & Assumptions

- Roadmap (`roadmap.md`) still shows F-01/S-02 as `in-progress` and S-04 as `blocked` — this is a stale bookkeeping gap per `research.md`, not a real blocker; worth a `/10x-roadmap` refresh alongside this plan.
- No test framework exists — verification relies on manual curl/browser checklists, consistent with prior slices.

## Success Criteria (Summary)

- A user can complete a full review session (reveal → grade → next) for all due cards without errors.
- Grading with each of the 4 ratings visibly changes `due`/`stability`/`state`/`reps` in a way consistent with FSRS semantics (e.g. `Again` schedules sooner than `Easy`).
- Unauthenticated access to `/flashcards/review` redirects to sign-in, matching every other `/flashcards/*` route.
