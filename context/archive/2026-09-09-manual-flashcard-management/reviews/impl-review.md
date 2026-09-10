<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Manual Flashcard CRUD Implementation Plan

- **Plan**: context/changes/manual-flashcard-management/plan.md
- **Scope**: Phase 1 and Phase 2 of 2 (full plan)
- **Date**: 2026-09-09
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | WARNING |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Missing try/catch around `context.request.json()` in POST/PATCH routes

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/flashcards/index.ts:40 (POST), src/pages/api/flashcards/[id].ts:24 (PATCH)
- **Detail**: Both routes call `await context.request.json()` with no try/catch. A malformed JSON body or wrong `Content-Type` throws an uncaught `SyntaxError`, producing Astro's generic error response instead of this project's mandated `{ error: { code, message } }` JSON shape. This is the same class of gap already found and fixed once this session in `auth-error-handling-hardening` (unwrapped `context.request.formData()` in the auth routes) — a second occurrence of the same pattern is a signal this is worth capturing as a recurring rule, not just a one-off fix.
- **Fix**: Wrap both `.json()` calls in try/catch, returning `{ error: { code: "validation_error", message: "Invalid request body." } }` with `400` on parse failure — same shape `signin.ts`/`signup.ts` already use for their `formData()` parsing.
- **Decision**: FIXED — both `POST`/`PATCH` now wrap `context.request.json()` in try/catch, returning `400 validation_error` on parse failure. `npm run lint` and `npm run build` re-verified passing.

### F2 — Service module doesn't follow CLAUDE.md's `index.ts`/`types.ts`/`__tests__` structure

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/lib/services/flashcards.service.ts
- **Detail**: CLAUDE.md's "Feature module structure" convention says a feature under `src/lib/services/` should keep `index.ts` (public exports), `types.ts` (local types), and colocated tests under `__tests__/`. `flashcards.service.ts` is a single flat dot-suffix file directly in `src/lib/services/` — correct per the separate "dot-suffix naming" convention, but not the grouped-folder shape. This is the *first* service in the codebase, so whatever shape it takes here becomes the de facto precedent for the next one — worth a conscious decision rather than silently setting a pattern by default.
- **Fix**: Accept the flat dot-suffix file as the pattern for small, single-concern services (reserve the `index.ts`/`types.ts`/`__tests__/` folder shape for services that actually grow multi-file) — record this distinction so the next service author isn't guessing.
- **Decision**: FIXED — CLAUDE.md's "Feature module structure" bullet now explicitly documents this distinction (flat dot-suffix file for small single-concern services, grouped folder reserved for services that grow multi-file), using `flashcards.service.ts` as the worked example.

### F3 — API routes only check non-empty, not the 2000-char upper bound

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/flashcards/index.ts:41-46, src/pages/api/flashcards/[id].ts:25-30
- **Detail**: The routes' own validation only checks `typeof === "string"` and non-empty after trim — not the upper bound. An oversized payload sent directly to the API (bypassing the UI's client-side check) still ends up correctly rejected, just indirectly: it falls through to the DB's CHECK constraint (`23514`), which `mapError()` already maps to a clean `400 validation_error`. Not a bug — behavior is correct — just worth tightening for clarity if touched again.
- **Fix**: Add an upper-bound check (`.length <= 2000` after trim) alongside the existing non-empty check, so the route's own validation is self-documenting rather than relying on the DB constraint as the only enforcement of the upper bound.
- **Decision**: FIXED — both routes now check `body.question.trim().length > MAX_LENGTH` / `body.answer.trim().length > MAX_LENGTH` (2000) alongside the existing non-empty checks. `npm run lint` and `npm run build` re-verified passing.

## Additional verification performed

- **Plan Drift (sub-agent)**: all 11 planned files across both phases — MATCH, zero real drift. Two small EXTRA defensive additions (a `!supabase` null-guard in both API route files, an `if (!id)` 404 guard in `[id].ts`) are benign, consistent with CLAUDE.md's own "`createClient()` can return null" convention, and not worth reverting.
- **Deliberate planning decision re-confirmed, not re-opened**: Agent 2 independently flagged that `updateFlashcard`/`deleteFlashcard`/`listFlashcards` filter only by `id` (no explicit `.eq("user_id", userId)`), relying entirely on RLS. This was an explicit, discussed choice during `/10x-plan` (the "Query scope" question — "Poleganie na RLS" was chosen over defense-in-depth), not an oversight. Confirmed still correctly implemented as decided; not re-raised as a pending finding.
- **`package.json` dependency cleanup verified**: no stray `"cn"` or bare `"radix-ui"` package entries — the mid-implementation package swap (documented in the Phase 2 commit) left the tree clean.
- **Automated success criteria**: `npm run lint` → exit 0 (4 expected `no-console` warnings, consistent with existing convention). `npm run build` → succeeded.
- **Manual success criteria**: all 17 Progress checkboxes across both phases are `[x]` with commit SHAs (`8a987ed`, `80ee4fb`) — every item has direct evidence from this session's interactive manual testing (curl-based Phase 1 checks, full browser walkthrough for Phase 2, including the double-submit and inline-error-display checks added during plan review triage).
- **Safety & Quality (sub-agent)**: no XSS (no `dangerouslySetInnerHTML`/`set:html`, React auto-escapes), no SQL injection (query builder only, no raw interpolation), authn checks present on every route, delete confirmation correctly gates the destructive call (not bypassable via a direct wiring mistake), no unhandled promise rejections in the UI layer.
- **Pattern compliance (sub-agent)**: error shape, uppercase route exports, `@/*` imports, `ServerError.tsx` reuse, Tailwind cosmic-aesthetic consistency, and the `@radix-ui/react-dialog` (scoped, not monolithic) convention all verified compliant.
