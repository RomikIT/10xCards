<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Minimal Flashcard Data Schema Implementation Plan

- **Plan**: context/changes/minimal-flashcard-schema/plan.md
- **Scope**: Phase 1 and Phase 2 of 2 (full plan — both phases fully complete)
- **Date**: 2026-09-09
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — `updated_at` trigger doesn't guard INSERT, so `created_at`/`updated_at` can be forged on insert

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260909090431_create_flashcards_table.sql:31-34
- **Detail**: The trigger only fires `before update`. Column `default now()` only applies when a column is *omitted* from an INSERT — a client using the `authenticated` role (which passes the `flashcards_insert_own` RLS check) can still include arbitrary `created_at`/`updated_at` values in the insert payload and have them persisted verbatim. This matches what the plan literally specified, so it's not drift — it's a gap in the plan/migration itself. Not currently exploitable (no API route or client code writes to this table yet — S-02/S-03 land later), but the DB layer should be the enforcement point per this project's own migration-first RLS convention, and fixing it now (before any insert path exists) is far cheaper than retrofitting it later.
- **Fix**: Widen the trigger to fire `before insert or update`, and set `created_at`/`updated_at` unconditionally on insert (`if tg_op = 'insert' then new.created_at = now(); end if; new.updated_at = now();` in the function body). Since no application code or remote/shared environment consumes this table yet, amend the existing migration file directly rather than adding a new one.
  - Strength: Closes the forgery gap for both timestamps at the one place they're defined, before any insert path exists to depend on the current behavior.
  - Tradeoff: None significant — table has no consumers yet, so no data or app code depends on current behavior.
  - Confidence: HIGH — standard Postgres trigger pattern, low blast radius.
  - Blind spot: None significant.
- **Decision**: FIXED — trigger widened to `before insert or update`; function now sets `created_at` on INSERT and `updated_at` on both.

### F2 — Trigger function doesn't pin `search_path`

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260909090431_create_flashcards_table.sql:21-29
- **Detail**: `public.set_updated_at()` doesn't set `search_path`, which Supabase's own security linter flags as "Function Search Path Mutable". Actual exploitability here is low — the function body only touches `NEW`/`OLD` record fields with no unqualified references — but it's a standard hardening step and will otherwise surface as a dashboard warning.
- **Fix**: Add `set search_path = ''` to the function definition (`language plpgsql set search_path = '' as $$ ... $$`).
- **Decision**: FIXED — `set search_path = ''` added to `public.set_updated_at()`.

### F3 — Single-column index may not suit future list-query pattern

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: supabase/migrations/20260909090431_create_flashcards_table.sql:16
- **Detail**: Only `flashcards_user_id_idx (user_id)` exists. A per-user list view ordered by recency (likely in S-03) would benefit from a composite `(user_id, created_at)` index instead of a separate sort step. Note: the plan's own "Performance Considerations" section already discusses this index and explicitly scopes further indexing work out ("No other performance work is in scope"), so this is a forward pointer for S-03, not a gap in this slice.
- **Fix**: No action needed now — revisit when S-03's list query is built; add a composite index then if the query plan shows a sort cost.
- **Decision**: SKIPPED — deferred to S-03 as originally scoped in the plan.

## Additional verification performed

- **Plan Drift (sub-agent)**: all 4 changed files (migration, seed.sql, README.md, src/types.ts) — MATCH against plan contract. No drift, no missing pieces, no scope creep.
- **Git scope check**: changed files across both implementation commits (44674c1, cd9f2f2) are exactly `README.md`, `supabase/seed.sql`, `supabase/migrations/20260909090431_create_flashcards_table.sql`, `src/types.ts` — all planned, nothing unplanned.
- **Automated success criteria**: `npm run lint` → exit 0. `npm run build` → succeeded. Migration naming convention verified (`ls supabase/migrations/`). `npx supabase db reset` was **not** re-run — local Supabase is running with manually-verified test data from Phase 1's RLS/cascade/trigger checks already in place (per Progress log, commit 44674c1); resetting would destroy that state without adding new signal, since the migration's application was already verified and stamped.
- **Manual success criteria**: all Progress checkboxes for Phase 1 and Phase 2 are `[x]` with commit references (44674c1, cd9f2f2) — no unchecked items, no rubber-stamping signal (evidence: migration file content matches every manually-verified claim: 4 RLS policies, CHECK constraints, cascade FK, trigger).
- **Pattern compliance (sub-agent)**: migration and `src/types.ts` both verified against CLAUDE.md's explicit conventions (migration filename format, granular per-operation RLS policies, `src/types.ts` placement for shared entity types) — PASS on all counts.
