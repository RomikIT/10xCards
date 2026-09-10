<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Convert Pasted Study Text into AI-Generated, Reviewable Flashcards

- **Plan**: context/changes/ai-generated-flashcard-review/plan.md
- **Scope**: Phase 1 of 2, Phase 2 of 2 (full plan)
- **Date**: 2026-09-09
- **Verdict**: APPROVED
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

## Automated verification

- `npm run lint` — PASS (0 errors, 11 pre-existing `no-console` warnings)
- `npm run build` — PASS

## Manual verification evidence

All 18 manual Progress items (1.3-1.10, 2.3-2.10) are backed by real evidence:
- Phase 1 (API-level): curl tests against the live dev server with a real authenticated session — 401/400/400/200/502 paths all exercised, plus a standalone script confirming the OpenRouter model + `response_format: json_schema` combination.
- Phase 2 (UI-level): live browser testing via Chrome automation — full generate → accept/edit/reject flow, empty-input/too-long-input validation, "no candidates" empty state, and a broken-key → error → restore-key → retry cycle, with screenshots and persisted-data verification on `/flashcards`.

No rubber-stamped checkboxes found.

## Findings

### F1 — No timeout on the OpenRouter fetch call

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real gap, timeout-duration choice is a judgment call
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/ai-flashcard-generation.service.ts:69-83
- **Detail**: The `fetch()` to OpenRouter has no `AbortController`/timeout. A slow or hung upstream response holds the request open indefinitely (bounded only by Cloudflare's own platform-level request duration limit, not by the app), leaving the user stuck on "Generating flashcards…" with no feedback until that platform limit fires.
- **Fix**: Add `signal: AbortSignal.timeout(20000)` to the fetch options; catch the resulting `AbortError` alongside the existing network-error catch and map it to the same `GENERATION_FAILED_ERROR`.
  - Strength: Bounds worst-case latency to a known value, gives the user a real error instead of an indefinite spinner.
  - Tradeoff: An arbitrary timeout value could cut off a genuinely slow-but-successful generation on a very long paste.
  - Confidence: HIGH — `AbortSignal.timeout()` is a standard, Workers-compatible native API; no new dependency needed.
  - Blind spot: Haven't measured real OpenRouter p99 latency for this model to tune the exact threshold.
- **Decision**: FIXED — added `REQUEST_TIMEOUT_MS = 20000` and `signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)`; existing generic catch already maps AbortError to GENERATION_FAILED_ERROR.

### F2 — CandidateCard owns its own fetch, diverging from S-03's "manager owns fetch" convention

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — was an explicit, already-approved plan decision; revisiting it is a real tradeoff, not a bug fix
- **Dimension**: Pattern Consistency
- **Location**: src/components/flashcards/CandidateCard.tsx:51-71 vs. src/components/flashcards/FlashcardListItem.tsx
- **Detail**: In S-03's pair, `FlashcardManager` is the sole fetch-owner — `FlashcardListItem`/`CreateFlashcardForm` only receive callback props and never call `fetch` themselves. `CandidateCard` breaks this: it performs its own `fetch("/api/flashcards", ...)` and defines its own `extractErrorMessage`, now duplicated a third time across the codebase. This was an explicit contract in plan.md's Phase 2 Change #2, reviewed and approved in `/10x-plan-review` without objection — it works correctly and is fully tested.
- **Fix A ⭐ Recommended**: Leave as-is
  - Strength: Already implemented, tested end-to-end (curl + live browser), and matches the plan's explicit, reviewed contract; a card independently owning "accept with whatever I'm currently showing" is arguably clearer than routing every card's save through the parent.
  - Tradeoff: Three near-identical `extractErrorMessage` copies now exist in the codebase instead of one.
  - Confidence: HIGH — no functional issue found, purely a code-organization preference.
  - Blind spot: None significant.
- **Fix B**: Refactor to match S-03 — move the `fetch` up into `GenerateFlashcards` as an `onAccept(command)` prop
  - Strength: Restores a single fetch-owner convention across both flashcard-list features.
  - Tradeoff: Touches already-shipped, working, tested code for a consistency gain with no functional benefit; the refactor itself carries small regression risk.
  - Confidence: MEDIUM — mechanically straightforward, but re-tests needed for 2.4/2.5/2.6.
  - Blind spot: Haven't checked whether a future feature might want per-card save state that this refactor would need to re-introduce anyway.
- **Decision**: ACCEPTED — Fix A (leave as-is); already an approved, tested plan decision.

### F3 — Pasted study text goes into the LLM prompt unsanitized (prompt injection)

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/ai-flashcard-generation.service.ts:79
- **Detail**: User-pasted text is passed directly as the user-message content with no delimiting. `response_format: json_schema` constrains output shape but not content. Not required by the PRD; low-stakes since worst case is a nonsensical flashcard, still gated by accept/reject review.
- **Fix**: No action needed for MVP; if hardening is wanted later, wrap the pasted text in an explicit delimiter in the prompt and instruct the model to treat it as data only.
- **Decision**: SKIPPED — low risk, not required by PRD.

### F4 — Route validates trimmed length but forwards the untrimmed string

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/flashcards/generate.ts:44
- **Detail**: `body.text.trim().length` is checked against the bounds, but `generateFlashcardCandidates(body.text)` is called with the untrimmed value. Harmless today since the client already trims before sending, but not defensively consistent for a direct API caller.
- **Fix**: Call `generateFlashcardCandidates(body.text.trim())` instead.
- **Decision**: FIXED
