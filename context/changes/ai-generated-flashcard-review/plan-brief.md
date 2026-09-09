# AI-Generated Flashcard Review — Plan Brief

> Full plan: `context/changes/ai-generated-flashcard-review/plan.md`

## What & Why

Users currently can only create flashcards one at a time by hand (S-03). This adds the AI-generation path from the PRD's core value proposition (US-01, FR-003, FR-004): paste a block of study text, get AI-generated question/answer candidates, and review each one (accept, edit, or reject) before it's saved — removing the manual-authoring bottleneck that discourages spaced-repetition study.

## Starting Point

The `flashcards` table, its RLS policies, and the full manual CRUD stack (service layer, `POST/GET/PATCH/DELETE /api/flashcards[/:id]`, `/flashcards` page and React components) already exist and ship in production (S-03). No AI/LLM integration exists anywhere in the codebase yet — this is the first external AI-provider call in the project.

## Desired End State

A logged-in user visits `/flashcards/generate`, pastes study text, and gets a reviewable list of AI-generated candidates. Accepting a candidate (as-is or after editing) saves it to their deck immediately; rejecting discards it with no server call. Bad input (empty, too short, too long, or text with nothing extractable) shows a clear message instead of a silent failure or a cryptic error.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Candidate storage before accept | Client-side React state only | No new schema/cleanup job needed; PRD frames this as one review sitting, not a resumable session |
| Model tier | Cheap/fast OpenRouter model (e.g. "mini"/"flash" class) | Fits the NFR's <2s acknowledgement expectation and Workers' CPU-ms budget better than a flagship model |
| Structured output | `response_format` JSON schema + server-side shape validation | Most reliable parsing; OpenRouter's OpenAI-compatible API supports it |
| Candidate count | Model-decided, capped at 20 | Matches the PRD's "one discrete fact = one card" business logic rather than forcing a fixed count |
| LLM failure handling | Single attempt, no auto-retry | Consistent with the rest of the codebase (no retry logic anywhere) and avoids compounding Workers CPU-ms/latency risk |
| Input limits | Hard cap ~10,000 chars, min ~20 chars | Directly mitigates the CPU-ms risk `infrastructure.md` flags for large pastes, and satisfies the "unusable input shows a message" acceptance criterion |
| Save flow | Immediate save per Accept, reusing the existing `POST /api/flashcards` unchanged | Zero new backend surface; accepted cards are durably saved the instant they're accepted, no risk of losing work mid-review |
| Testing approach | Manual verification only (no framework) | No test framework exists anywhere in the repo; consistent with S-03's precedent |

## Scope

**In scope:**
- New `POST /api/flashcards/generate` endpoint calling OpenRouter
- New `/flashcards/generate` page and React review UI (accept/edit/reject per candidate)
- `OPENROUTER_API_KEY` secret wiring (`env.schema`, `.env.example`)

**Out of scope:**
- Any new database table, bulk-save endpoint, or automated retry logic
- Chunking long input across multiple AI calls
- A model picker or configurable candidate count in the UI
- Automated tests (none exist in this repo)

## Architecture / Approach

Phase 1 (backend) is fully self-contained and curl-testable: a new service (`ai-flashcard-generation.service.ts`) builds the prompt, calls OpenRouter, and validates the JSON shape; a thin API route wraps it with the same auth-guard/error-envelope pattern as the existing flashcards routes. Phase 2 (frontend) adds the page and components but touches zero new backend surface — "Accept" just calls the S-03 `POST /api/flashcards` endpoint that already exists.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Backend — OpenRouter integration | `/api/flashcards/generate` endpoint, curl-verifiable end to end | Hardcoded model identifier may not exist on OpenRouter's current catalog by implementation time |
| 2. Frontend — review UI | `/flashcards/generate` page with accept/edit/reject flow | None significant — pure UI plus reuse of an existing, already-tested endpoint |

**Prerequisites:** F-01 (flashcards schema) and S-01 (auth) — both already shipped, per the roadmap's `in-progress` status covering "re-verify in production," not blocking this work.
**Estimated effort:** ~1-2 after-hours sessions across 2 phases.

## Open Risks & Assumptions

- The exact OpenRouter model identifier hardcoded in Phase 1 may need adjustment at implementation time (catalogs change frequently) — flagged explicitly as a manual verification step.
- Whether the chosen model/prompt actually hits the PRD's 75% acceptance target is unvalidated until Phase 2's manual testing with real study text — this plan doesn't gate on that number, per the roadmap's own note that it's a non-blocking Unknown requiring real-text testing.

## Success Criteria (Summary)

- A user can paste text, generate candidates, and accept/edit/reject each one, with accepted cards appearing on `/flashcards`
- Empty, too-short, too-long, or unusable input shows a clear message rather than a silent failure or crash
- A broken AI call fails visibly (generic error, retryable) instead of hanging or 500ing silently
