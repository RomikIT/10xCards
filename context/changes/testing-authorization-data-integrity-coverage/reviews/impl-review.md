<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Authorization and Data-Integrity Coverage

- **Plan**: context/changes/testing-authorization-data-integrity-coverage/plan.md
- **Scope**: Phase 4 of 4 (full plan)
- **Date**: 2026-09-11
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — test-plan.md §3 Phase 2 status not flipped to `complete`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/test-plan.md (§3 Phased Rollout table)
- **Detail**: Phase 4's plan text says "This is the final phase of the rollout — after confirmation, update `context/foundation/test-plan.md` §3 Phase 2 Status to `complete`." All 4 phases are implemented, committed, and all Progress checkboxes are `[x]`, but the §3 table row for Phase 2 still reads `researched` instead of `complete`.
- **Fix**: Update the §3 table row's Status cell from `researched` to `complete`.
- **Decision**: FIXED

### F2 — Partial-failure orphaning in `createTwoRealUsers()` / `cleanup()`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/__tests__/helpers/real-supabase.ts:65-73
- **Detail**: `Promise.all([signUpRealUser(...), signUpRealUser(...)])` and the `cleanup()` function's `Promise.all([...deleteUser, ...deleteUser])` both fail fast — if one signup or one delete rejects, the other user is left orphaned in local Supabase with no retry or cleanup path. Acceptable for a local/CI-only disposable instance, but worth hardening since it's a repeatable hygiene concern across every integration test run.
- **Fix**: Switch both `Promise.all` calls to `Promise.allSettled`, and `console.warn` (not throw) on any settled rejection so a partial failure doesn't cascade into cleanup being skipped entirely for the user that did succeed.
- **Decision**: FIXED

### F3 — `test:integration` script uses a substring filter instead of the plan's literal glob

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: package.json ("test:integration" script)
- **Detail**: The plan's Phase 2 contract specified `"test:integration": "vitest run \"**/*.integration.test.ts\""`. The implemented version is `"vitest run integration"` — a Vitest positional filename-substring filter, not a glob. Functionally equivalent today (only files matching `*.integration.test.ts` exist and all contain "integration" in their path), verified working via `npm run test:integration`, but the literal glob form was attempted first and failed with "No test files found" (Vitest's positional filter isn't glob-aware) before landing on the substring form — this was a necessary in-flight correction, not an oversight.
- **Fix**: None needed — leave as-is; documenting for the record only.
- **Decision**: SKIPPED
