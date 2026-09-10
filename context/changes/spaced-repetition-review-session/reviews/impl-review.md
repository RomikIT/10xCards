<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Spaced-Repetition Review Session Implementation Plan

- **Plan**: `context/changes/spaced-repetition-review-session/plan.md`
- **Scope**: Phase 4 of 4 (full plan review)
- **Date**: 2026-09-10
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Non-concurrent CREATE INDEX could lock writes on flashcards

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `supabase/migrations/20260910054657_add_flashcard_srs_columns.sql:18`
- **Detail**: `create index flashcards_user_due_idx on public.flashcards (user_id, due);` is a plain, non-concurrent `CREATE INDEX`. Unlike the `ALTER TABLE ADD COLUMN` statements above it (safe metadata-only additions), a non-concurrent index build takes a lock that blocks writes (INSERT/UPDATE/DELETE) on `flashcards` for its duration. Low risk today (the table has ~5 rows, single user), but risky as a template for future migrations once the table has real production volume. The migration is already applied both locally and to the linked remote project, so "fixing" this means a follow-up migration (drop + `CREATE INDEX CONCURRENTLY`), not editing the landed file.
- **Fix A**: Leave as-is, revisit before scale
  - Strength: Zero extra work now; matches the project's stated `main_goal: speed` / `top_blocker: capacity` — the table is currently tiny (verified: 5 rows total, single dev user).
  - Tradeoff: Risk resurfaces silently if the table grows before anyone revisits it; nothing tracks "revisit later" beyond this note.
  - Confidence: HIGH — current table size directly verified during Phase 3 manual testing.
  - Blind spot: No visibility into how fast the table will grow before the next migration touches it.
- **Fix B ⭐ Recommended**: Add a follow-up migration that drops and recreates the index with `CREATE INDEX CONCURRENTLY`
  - Strength: Removes the lock-on-write risk permanently; trivially cheap right now while the index is tiny; establishes the safer pattern for whoever writes the next migration against this table.
  - Tradeoff: An extra migration file/churn for a currently negligible risk; `CONCURRENTLY` cannot run inside a transaction, which needs care in how the Supabase CLI migration runner is invoked.
  - Confidence: MEDIUM — haven't verified whether Supabase CLI's migration runner wraps each migration file in an implicit transaction that would reject a bare `CONCURRENTLY` statement.
  - Blind spot: Exact Supabase migration transaction behavior not verified in this review.
- **Decision**: ACCEPTED (Fix A) — Fix B was attempted first: a follow-up migration with `DROP INDEX` + `CREATE INDEX CONCURRENTLY` was written and run against local Supabase, but `supabase db reset` errored with `CREATE INDEX CONCURRENTLY cannot be executed within a pipeline (SQLSTATE 25001)` — the Supabase CLI wraps each migration file in a transactional pipeline that rejects `CONCURRENTLY`. The migration rolled back cleanly (verified: local DB left in the pre-migration state, no damage) and was deleted. Given the table's current size (5 rows, single user) and that a clean fix would require an out-of-band manual `psql` step outside the standard migration flow, the risk was accepted as-is. Revisit with an out-of-band `CREATE INDEX CONCURRENTLY` (or a Supabase CLI update that supports it) before the table reaches production volume.

### F2 — Grading endpoint doesn't map validation_error to 400, unlike its siblings

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/pages/api/flashcards/[id]/review.ts:55-57`
- **Detail**: `POST /api/flashcards/[id]/review` returns 500 for every `"error" in result`, while the established sibling pattern (`POST /api/flashcards`, `PATCH /api/flashcards/[id]`) maps `result.error.code === "validation_error"` to 400. This exactly matches what `plan.md`'s Phase 3 contract specified (`on {error} → 500`), so the implementation is not drifting from the plan — but the plan's contract itself diverges from the codebase's established status-mapping convention. Currently unreachable (no CHECK constraint on the new SRS columns can trigger `review.service.ts`'s `23514`→`validation_error` branch), so it's latent rather than an active bug. If a future migration adds a range constraint on `stability`/`difficulty`, this would surface as a misleading 500 instead of 400.
- **Fix**: Add the same `const status = result.error.code === "validation_error" ? 400 : 500;` mapping used in `flashcards/index.ts` and `flashcards/[id].ts`, for consistency and forward-safety.
- **Decision**: FIXED — applied in `src/pages/api/flashcards/[id]/review.ts:55-58`; `npm run lint` re-verified clean (0 errors).

### F3 — No pagination on the due-queue query (by design, not a defect)

- **Severity**: OBSERVATION
- **Dimension**: Safety & Quality
- **Location**: `src/lib/services/review.service.ts:32-46`, `src/pages/flashcards/review.astro:14`
- **Detail**: `listDueFlashcards` has no `.limit()`; the SSR page loads the full due-card result into page state before hydrating `ReviewSession`. This matches `plan.md`'s explicit "What We're NOT Doing" entry — "No session size cap — a session serves all due cards for the user, no pagination/limit" — a deliberate, user-confirmed MVP decision made during `/10x-plan`, not an oversight. Flagging only so a future revisit (if due-backlogs grow large for a lapsed user) has a pointer back to this decision.
- **Decision**: SKIPPED — confirmed as an already-deliberate, user-confirmed plan decision; not a defect.

### F4 — Fetch-then-write grading has no idempotency/concurrency guard

- **Severity**: OBSERVATION
- **Dimension**: Safety & Quality
- **Location**: `src/lib/services/review.service.ts:53-78`
- **Detail**: `gradeFlashcardReview` reads the card, computes the next FSRS state in the service, then writes it back in a separate UPDATE — no optimistic-concurrency check. The React component's `isSubmitting` guard (`ReviewSession.tsx:41`, added during plan-review triage as fix F4 for the plan) prevents UI double-submits, but a retried/duplicate HTTP request (e.g. a network-level retry) could apply two FSRS transitions against a stale read, double-counting a review. Low real-world impact for a single-user grading flow.
- **Decision**: SKIPPED — accepted as low risk at current single-user MVP scale; revisit if multi-device use or client-side retry logic is added later.
