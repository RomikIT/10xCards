<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Convert Pasted Study Text into AI-Generated, Reviewable Flashcards

- **Plan**: context/changes/ai-generated-flashcard-review/plan.md
- **Mode**: Deep
- **Date**: 2026-09-09
- **Verdict**: SOUND (post-triage; REVISE at initial review)
- **Findings**: 0 critical, 3 warnings, 1 observation — all triaged

## Verdicts

| Dimension | Verdict (initial) | Verdict (post-triage) |
|-----------|--------------------|------------------------|
| End-State Alignment | PASS | PASS |
| Lean Execution | PASS | PASS |
| Architectural Fitness | WARNING (F2) | PASS |
| Blind Spots | WARNING (F1, F3, F4) | PASS |
| Plan Completeness | PASS | PASS |

## Grounding

Grounding: 9/9 paths ✓ (astro.config.mjs, .env.example, flashcards.service.ts, api/flashcards/index.ts, api/flashcards/[id].ts, middleware.ts, flashcards.astro, FlashcardListItem.tsx, ServerError.tsx), 4/4 symbols ✓ (PROTECTED_ROUTES/startsWith, envField pattern, ServerError props, ServiceError export), brief↔plan ✓.

Deep verification (one general-purpose sub-agent): Astro route-priority claim (static `generate.ts` wins over dynamic `[id].ts`) CONFIRMED against `node_modules/astro`'s `routeComparator`/`priority.js` source; no CORS/CSRF/rate-limiting found on existing `/api/flashcards` routes; `ServiceError` confirmed exported from `flashcards.service.ts:7-10` (plan had duplicated it inline — see F2); no naming collisions for new types; no existing `randomUUID` convention to follow; `astro:env/server` has only two consumers (`supabase.ts`, `config-status.ts`) — the second one led to discovering F1.

## Findings

### F1 — Missing-secret UX and provisioning steps not carried over

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real gap, no tradeoff, but touches deployment-readiness
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Changes Required / Manual Verification
- **Detail**: `src/lib/config-status.ts` + `src/layouts/Layout.astro:23` is an established sitewide banner pattern warning users when a required integration secret is missing (currently only Supabase). The plan didn't register `OPENROUTER_API_KEY` there, and didn't mention adding the key to local `.dev.vars` or running `wrangler secret put` for production — `infrastructure.md`'s risk register explicitly names this exact failure class for any new env var added to `env.schema`.
- **Fix**: Add a Phase 1 change registering OpenRouter in `config-status.ts`'s `configStatuses` array (mirroring the Supabase entry), plus Manual Verification bullets for `.dev.vars`, the banner, and `wrangler secret put`.
  - Strength: Closes a gap the project's own risk register already predicted for exactly this secret, using a pattern the codebase already has.
  - Tradeoff: None — purely additive, mirrors existing code.
  - Confidence: HIGH.
  - Blind spot: Docs URL/message copy is a minor judgment call, not a design risk.
- **Decision**: FIXED — added as Phase 1 Change #5 (`config-status.ts`) plus Progress items 1.9–1.11 in plan.md.

### F2 — New service duplicates an already-exported error type

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — genuine two-path tradeoff
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 — AI flashcard generation service
- **Detail**: `flashcards.service.ts:7-10` already exports `ServiceError {code, message}`. The plan's new service defined its own inline error shape instead of reusing it — duplication that crosses into "shared type" territory now that two services need the same shape (CLAUDE.md: shared types go in `src/types.ts`).
- **Fix A**: Import `ServiceError` directly from `flashcards.service.ts`.
  - Strength: Minimal diff, no existing file touched.
  - Tradeoff: Cross-service import of another service's implementation-detail type.
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Fix B ⭐ Recommended**: Move `ServiceError` into `src/types.ts`, import from both services.
  - Strength: Matches CLAUDE.md's explicit shared-types convention now that two services need the same shape.
  - Tradeoff: Touches one line of the already-shipped `flashcards.service.ts`.
  - Confidence: HIGH — CLAUDE.md's rule is direct and on-point.
  - Blind spot: None significant — type-only move, no behavior change.
- **Decision**: FIXED via Fix B — `ServiceError` moved to `src/types.ts`; `flashcards.service.ts` and the new `ai-flashcard-generation.service.ts` both import it. Changes renumbered in Phase 1 (now 5 items).

### F3 — Model verification checks existence, not structured-output support

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick, one-line wording fix
- **Dimension**: Blind Spots
- **Location**: Phase 1 Manual Verification (item 1.8)
- **Detail**: The structured-output design depends on the chosen model supporting `response_format: json_schema`, but the original verification item only checked that the model "resolves" (exists) on OpenRouter's catalog, not that it supports schema mode.
- **Fix**: Reword the item to check both existence and `response_format: json_schema` support.
- **Decision**: FIXED — folded into F1's edit; item 1.8 now reads "Confirm OPENROUTER_MODEL resolves on OpenRouter's catalog and supports response_format: json_schema."

### F4 — No cooldown on repeated manual Generate clicks

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Blind Spots
- **Location**: Phase 2 — `GenerateFlashcards.tsx`
- **Detail**: `isGenerating` blocks a second request while one is in flight, but nothing stops repeated clicks once each request finishes — each one a paid OpenRouter call. No NFR requires throttling this, and the project's stated priority is speed over hardening.
- **Fix (optional)**: A short client-side cooldown (~2-3s) after a completed request, only if abuse/cost becomes a concern post-launch.
- **Decision**: ACCEPTED — no NFR requires it; left as-is for MVP.
