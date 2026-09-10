<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Spaced-Repetition Review Session Implementation Plan

- **Plan**: `context/changes/spaced-repetition-review-session/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-10
- **Verdict**: SOUND (minor warnings only, all cheap to fix — all 4 applied during triage)
- **Findings**: 0 critical, 4 warnings, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

9/9 referenced file paths confirmed to exist; 4/5 symbols confirmed as claimed (`mapError` is private/unexported in `flashcards.service.ts` — see F1); brief↔plan consistent.

## Codebase verification (deep mode)

One sub-agent verified the 4 riskiest claims in the plan against actual `ts-fsrs` v5.4.2 source and Astro 6 routing semantics:

1. **`TypeConvert.card()` numeric `state` input** — CONFIRMED. `TypeConvert.state()` branches on `typeof value === 'number'` and returns it directly; the plan's smallint column round-trips correctly.
2. **Astro `[id].ts` + `[id]/review.ts` coexistence** — CONFIRMED no collision. Different path-segment arity means the two routes never match the same URL.
3. **Blast radius of extending `Flashcard`** — CONFIRMED non-issue. No file in `src/` constructs a `Flashcard` object literal by hand; all values come from Supabase query casts or API pass-through.
4. **`fsrs()` factory cost** — CONFIRMED cheap. One-line factory, synchronous constructor, no I/O — safe to call per-request as the plan does.

## Findings

### F1 — mapError() reuse instruction is ambiguous/impossible as written

- **Severity**: WARNING
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — `review.service.ts` contract
- **Detail**: The contract said errors "map through the same `mapError()`-style helper used in `flashcards.service.ts`". `mapError` there (`flashcards.service.ts:7`) has no `export` keyword — module-private. An implementer could attempt an invalid import.
- **Fix**: Reworded the Phase 2 contract to explicitly say review.service.ts defines a local, unexported `mapError()`-equivalent, structurally identical (same `{code, message}` shape, same `23514`→`validation_error` mapping) — not imported.
- **Decision**: FIXED

### F2 — Grading endpoint would accept Rating.Manual, which isn't a real grade

- **Severity**: WARNING
- **Impact**: LOW
- **Dimension**: Blind Spots
- **Location**: Phase 3 — `POST /api/flashcards/[id]/review` contract
- **Detail**: Validation of "one of ts-fsrs's `Rating` enum values" would also pass `Rating.Manual`, which is meant for administrative rescheduling, not user grading; the UI never sends it.
- **Fix**: Narrowed validation to exactly the 4 grading values (Again/Hard/Good/Easy), explicitly rejecting `Manual`.
- **Decision**: FIXED

### F3 — formatDate() promised for "review UI's date display" that Phase 4 never builds

- **Severity**: WARNING
- **Impact**: LOW
- **Dimension**: Plan Completeness
- **Location**: Phase 2 (Intent) vs. Phase 4 (Contract)
- **Detail**: Phase 2's Intent claimed `formatDate()` is used by "the review UI's date display", but Phase 4's `ReviewSession` contract never displays any date — promise-gap between phases.
- **Fix**: Removed the "review UI's date display" clause from Phase 2's Intent — `formatDate()` is used only by the due-queue query in this slice.
- **Decision**: FIXED

### F4 — No double-submit guard specified on grading buttons

- **Severity**: WARNING
- **Impact**: LOW
- **Dimension**: Blind Spots
- **Location**: Phase 4 — `ReviewSession` component contract
- **Detail**: `FlashcardListItem.tsx`'s existing pattern uses an `isSubmitting` flag to disable buttons mid-request. The `ReviewSession` contract didn't specify an equivalent guard on the 4 rating buttons, risking a double-click firing two grading requests for the same card.
- **Fix**: Added an `isSubmitting` state to the `ReviewSession` contract, disabling all 4 rating buttons while the current card's grading request is in flight.
- **Decision**: FIXED
