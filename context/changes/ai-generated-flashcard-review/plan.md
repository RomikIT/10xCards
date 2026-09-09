# Convert Pasted Study Text into AI-Generated, Reviewable Flashcards — Implementation Plan

## Overview

Add an AI-assisted flashcard creation path (FR-003, FR-004, US-01): a new API route calls an LLM via OpenRouter to turn pasted study text into flashcard candidates, and a new page lets the user review each candidate — accept (optionally after editing) or reject — before anything is persisted. Accepted candidates are saved through the existing `POST /api/flashcards` endpoint from S-03, so this change adds no new persistence surface beyond a new generation-only route.

## Current State Analysis

- `flashcards` table + RLS already exist (F-01, `supabase/migrations/20260909090431_create_flashcards_table.sql`): `question`/`answer` (1-2000 chars trimmed), `user_id`, per-user RLS on all 4 operations.
- `src/lib/services/flashcards.service.ts` provides `listFlashcards`/`createFlashcard`/`updateFlashcard`/`deleteFlashcard`, each returning a tagged-union result (`{data}` / `{error}` / `{notFound}`), with a local `ServiceError = {code, message}` and a `mapError()` that turns Postgres `23514` into `validation_error`.
- `src/pages/api/flashcards/index.ts` (`GET`/`POST`) and `src/pages/api/flashcards/[id].ts` (`PATCH`/`DELETE`) establish the API convention: every handler starts with a `context.locals.user` guard (401 `unauthorized`), builds its own `createClient(context.request.headers, context.cookies)` (500 `internal_error` if null), and responds with `Response.json({...}, {status})` using the `{error:{code,message}}` envelope.
- `src/middleware.ts:4` — `PROTECTED_ROUTES = ["/dashboard", "/flashcards"]`, matched via `.startsWith()` (line 16) — a new `/flashcards/generate` page is automatically protected with no middleware change needed.
- `src/pages/flashcards.astro` and `src/components/flashcards/{FlashcardManager,CreateFlashcardForm,FlashcardListItem}.tsx` establish the React conventions: a "Manager" component owns state and `fetch()` calls; children own local `isEditing`/`isSubmitting`/`error` state; every component renders `<ServerError message={error} />` (`src/components/auth/ServerError.tsx`) for inline error display; validation is hand-rolled (`question.trim().length > 0 && <= MAX_LENGTH`), no schema library.
- No AI/LLM integration exists anywhere in the codebase yet — no HTTP client or AI SDK dependency, no `OPENROUTER_*` env var declared in `astro.config.mjs`'s `env.schema` (currently only `SUPABASE_URL`/`SUPABASE_KEY`, both `envField.string({context:"server", access:"secret", optional:true})`).
- No test framework exists anywhere in the repo (confirmed absent from `package.json`); S-03 shipped with a manual verification checklist only.
- `context/foundation/infrastructure.md`'s risk register explicitly flags: Cloudflare Workers bills CPU-time, and local text processing before the OpenRouter call is the workload most likely to quietly cross the free-tier CPU-ms threshold on large pastes — mitigation is "keep local text pre-processing before the OpenRouter call minimal."

## Desired End State

A logged-in user can go to `/flashcards/generate` (linked from `/flashcards`), paste study text, click "Generate flashcards," and see a list of AI-generated question/answer candidates. For each candidate they can accept it as-is (saved immediately to their deck via the existing flashcards endpoint), edit its question/answer before accepting, or reject it (discarded, never sent to the server). Empty, too-short, or too-long input shows an explanatory inline message instead of calling the AI. A failed AI call shows a generic error the user can retry by clicking the button again.

**Verification**: manually paste real study text (per the roadmap's flagged Unknown — "which prompt/extraction approach yields flashcards good enough to hit the 75% acceptance target" — Phase 2's manual verification is the first round of that testing) and confirm accept/edit/reject each behave as specified; confirm the 400/401/502 error paths via curl and a deliberately-broken API key.

### Key Discoveries:

- `src/pages/api/flashcards/index.ts`'s POST handler is the exact contract to reuse unchanged for saving accepted candidates — no new persistence endpoint needed.
- Astro's file router resolves `src/pages/api/flashcards/generate.ts` as a static route that takes precedence over the dynamic `src/pages/api/flashcards/[id].ts` for the literal `/api/flashcards/generate` path — no route-collision risk.
- `PROTECTED_ROUTES` uses prefix matching (`middleware.ts:16`), so no middleware change is needed for the new page.

## What We're NOT Doing

- No new database table or schema change — candidates live only in client-side React state until accepted; nothing is persisted until the user clicks Accept.
- No bulk/batch-save endpoint — each Accept immediately calls the existing single-candidate `POST /api/flashcards`.
- No automatic retry of failed AI calls — one attempt per click; the user retries manually.
- No chunking of long input into multiple AI calls — a single hard length cap instead.
- No new test framework — manual verification only, consistent with S-03.
- No streaming/incremental generation progress — a static loading indicator only.
- No configurable candidate count or model picker in the UI — both are fixed in code (model as a named constant, count bounded by the prompt plus a server-side cap).

## Implementation Approach

Two phases mirroring S-03's backend/frontend split. Phase 1 adds the AI integration as a self-contained service plus one new API route, independently verifiable via curl without any UI. Phase 2 adds the review UI and wires Accept to the pre-existing flashcards-create endpoint, so the only new backend surface touched in Phase 2 is zero — it's pure frontend plus reuse.

## Critical Implementation Details

**Model choice and drift risk**: this plan hardcodes a specific OpenRouter model identifier as a starting default (see Phase 1). OpenRouter's model catalog changes frequently and the exact identifier may be renamed, deprecated, or repriced by the time this is implemented — Phase 1's manual verification must confirm the chosen model still resolves on OpenRouter before relying on it, and swap to a current equivalent cheap/fast model if not. This is a one-line constant change, not a design change.

**CPU-ms budget**: per `infrastructure.md`'s risk register, do all input-length validation (Phase 1) before doing any other local text processing, and do not add any local chunking/pre-processing of the pasted text beyond trimming — the only non-trivial local work should be the network call itself and the response JSON parse/shape-check.

## Phase 1: Backend — OpenRouter integration and generate endpoint

### Overview

Add the `OPENROUTER_API_KEY` secret, a self-contained AI-generation service, and a new `POST /api/flashcards/generate` route that validates input, calls OpenRouter, and returns parsed/validated candidates. No persistence in this phase — reads/writes nothing to `flashcards`.

### Changes Required:

#### 1. Env schema and secret scaffolding

**File**: `astro.config.mjs`

**Intent**: Declare the new server secret the OpenRouter call needs, following the exact pattern already used for `SUPABASE_URL`/`SUPABASE_KEY`.

**Contract**: Add `OPENROUTER_API_KEY: envField.string({ context: "server", access: "secret", optional: true })` to `env.schema`. `optional: true` matches the existing Supabase fields' graceful-degradation convention — the service checks for a missing key itself (see Change #3) rather than the build failing.

**File**: `.env.example`

**Intent**: Document the new required local env var for `npm run dev`, mirroring the existing two entries.

**Contract**: Add a line `OPENROUTER_API_KEY=###`.

#### 2. Shared `ServiceError` type

**File**: `src/lib/services/flashcards.service.ts`

**Intent**: `ServiceError` is currently declared and exported locally in this file; now that a second service needs the same `{code, message}` shape, promote it to a shared type per CLAUDE.md's "Shared types go in `src/types.ts`" convention.

**Contract**: Remove the local `export interface ServiceError {...}` declaration and replace it with `import type { ServiceError } from "@/types";`. No behavioral change — same shape, same name, just relocated.

**File**: `src/types.ts`

**Intent**: Host the now-shared `ServiceError` type.

**Contract**: Add `export interface ServiceError { code: string; message: string }`.

#### 3. AI flashcard generation service

**File**: `src/lib/services/ai-flashcard-generation.service.ts` (new)

**Intent**: Given raw study text, call OpenRouter with a prompt that extracts discrete facts as question/answer pairs, and return a validated list of candidates — or a tagged error — without touching the database.

**Contract**:

- Exported function `generateFlashcardCandidates(text: string): Promise<{ data: FlashcardCandidate[] } | { error: ServiceError }>`, importing `ServiceError` from `@/types`. The error's `code` is always `"generation_failed"` for this service.
- Calls `https://openrouter.ai/api/v1/chat/completions` via native `fetch` (Workers-compatible; no new HTTP client dependency) with `OPENROUTER_API_KEY` (imported from `astro:env/server`) as a Bearer token, a hardcoded model constant (start with a current cheap/fast OpenRouter model — see Critical Implementation Details), and `response_format: { type: "json_schema", json_schema: {...} }` constraining the reply to `{"candidates": [{"question": string, "answer": string}]}`.
- System/user prompt instructs the model to extract 0-20 discrete facts/concepts from the input text as standalone question/answer flashcard pairs (matching the PRD's Business Logic section as the extraction rule), and to return an empty `candidates` array if no extractable facts are found.
- After receiving a response, parse the JSON and validate its shape: `candidates` must be an array of at most 20 items; each item's `question`/`answer` must be non-empty trimmed strings ≤2000 chars (mirroring the DB's own CHECK constraints) — items failing this per-item check are filtered out rather than failing the whole response.
- Any network error, non-2xx response, missing/malformed `OPENROUTER_API_KEY`, or unparseable JSON maps to `{ error: { code: "generation_failed", message: "We couldn't generate flashcards right now. Please try again." } }`. A response that parses fine but yields zero valid candidates (after filtering) is **not** an error — it's returned as `{ data: [] }`, letting the API route pass it through as a normal empty result.
- Non-exported: a module-level `const OPENROUTER_MODEL = "<model-id>"` constant and the prompt template string, both trivially editable without touching the function signature.

#### 4. Generate API route

**File**: `src/pages/api/flashcards/generate.ts` (new)

**Intent**: Validate the request, delegate to the service, and shape the HTTP response — following the exact auth-guard/response-envelope pattern already used in `src/pages/api/flashcards/index.ts`.

**Contract**:

- `export const POST: APIRoute`.
- Same `context.locals.user` guard (401 `unauthorized`) as the existing routes; this route does **not** need a Supabase client at all (no DB access), so it skips the `createClient`/500-null-check step entirely.
- Body: `{ text: string }` (new type `GenerateFlashcardsCommand` in `src/types.ts`). Reject invalid JSON the same way `index.ts`'s `POST` does (400 `validation_error`, "Invalid request body.").
- Validate `text`: `typeof text === "string"`, trimmed length ≥ `MIN_INPUT_LENGTH = 20` and ≤ `MAX_INPUT_LENGTH = 10000` (module-level constants). Below the minimum → 400 `validation_error`, message explaining the text is too short/empty to generate from (satisfies the PRD's "empty or unusable input shows an explanatory message" acceptance criterion). Above the maximum → 400 `validation_error` naming the 10,000-character limit.
- On success, call `generateFlashcardCandidates(text)`; on `{data}` return 200 `{ candidates: FlashcardCandidate[] }` (may be `[]`); on `{error}` return 502 with `{ error }` (new code `generation_failed`, distinct from the existing 4 codes since it represents an upstream-provider failure, not a client input or persistence error).
- New shared types added to `src/types.ts`: `FlashcardCandidate { question: string; answer: string }`, `GenerateFlashcardsCommand { text: string }`.

#### 5. Missing-secret status banner

**File**: `src/lib/config-status.ts`

**Intent**: Extend the existing sitewide "required integration secret is missing" banner (currently covers only Supabase) to also cover OpenRouter, so a misconfigured deployment warns the user upfront on every page instead of only failing when they click Generate.

**Contract**: Import `OPENROUTER_API_KEY` from `astro:env/server` and add a second entry to the exported `configStatuses` array: `{ name: "OpenRouter", configured: Boolean(OPENROUTER_API_KEY), message: "OpenRouter nie jest skonfigurowany — generowanie fiszek przez AI jest wyłączone.", docsUrl: "https://openrouter.ai/keys", docsLabel: "Pobierz klucz API" }`, mirroring the existing Supabase entry's shape exactly. No changes needed to `src/layouts/Layout.astro` — it already renders every entry in `missingConfigs`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run lint` (runs type-checked ESLint rules per CLAUDE.md)
- Build succeeds: `npm run build`

#### Manual Verification:

- `curl -X POST /api/flashcards/generate` without auth cookies returns 401 `unauthorized`
- Authenticated request with `{"text": ""}` (and with 5-character text) returns 400 `validation_error`
- Authenticated request with >10,000-character text returns 400 `validation_error`
- Authenticated request with a real paragraph of study text returns 200 with a non-empty `candidates` array of plausible question/answer pairs
- Temporarily setting `OPENROUTER_API_KEY` to an invalid value and repeating the happy-path request returns 502 `generation_failed`, not a silent 500 or hang
- Confirm the chosen `OPENROUTER_MODEL` both resolves on OpenRouter's current catalog and supports `response_format: json_schema` (per Critical Implementation Details) — if the happy-path check above fails, check this first
- `OPENROUTER_API_KEY` added to local `.dev.vars` before testing `npm run dev` against a real OpenRouter call
- Removing/unsetting `OPENROUTER_API_KEY` shows the new "OpenRouter nie jest skonfigurowany" banner on any page (e.g. `/dashboard`), matching the existing Supabase banner's behavior
- Before considering production deploy done: `wrangler secret put OPENROUTER_API_KEY` has been run, per `infrastructure.md`'s risk register mitigation for any new env var added to `env.schema`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Frontend — generation page and candidate review

### Overview

Add the `/flashcards/generate` page and its React components, wired to the Phase 1 endpoint for generation and to the existing `POST /api/flashcards` (from S-03) for saving accepted candidates. No backend changes in this phase.

### Changes Required:

#### 1. Generate page

**File**: `src/pages/flashcards/generate.astro` (new)

**Intent**: Host the client-side review flow behind the already-enforced `/flashcards` route protection, matching `src/pages/flashcards.astro`'s layout conventions.

**Contract**: Same `Layout` wrapper and header/back-link pattern as `src/pages/flashcards.astro` (link back to `/flashcards` instead of `/dashboard`). Renders `<GenerateFlashcards client:load />` — no SSR data-fetching needed (nothing to prefetch; the page starts empty).

**File**: `src/pages/flashcards.astro`

**Intent**: Give users an entry point into the new flow.

**Contract**: Add a link/button next to the existing "← Dashboard" link, e.g. "Generate with AI →" pointing at `/flashcards/generate`.

#### 2. Review components

**File**: `src/components/flashcards/GenerateFlashcards.tsx` (new)

**Intent**: Own the textarea input, the generate request, and the resulting candidate list — the "Manager" role for this flow, mirroring `FlashcardManager`'s state-ownership pattern.

**Contract**: Local state for `text`, `candidates: (FlashcardCandidate & { id: string })[]` (client-only `id` via `crypto.randomUUID()` for React keys and removal-by-id), `isGenerating`, `error`. `handleGenerate` mirrors `FlashcardManager`'s fetch-and-throw-on-non-2xx pattern against `POST /api/flashcards/generate`, replacing `candidates` with the response (tagging each with a generated `id`) on success. Renders `<ServerError message={error} />`, a length-aware textarea (reusing the same min/max validity-check pattern as the existing forms, mirrored from the server's 20/10,000 bounds) with a disabled Generate button until valid, and a "No flashcards could be generated from this text — try different or more detailed study material." message when `candidates` is an empty array after a successful generation. Renders one `<CandidateCard>` per candidate; removes a candidate from local state via its `id` when the card reports itself accepted or rejected.

**File**: `src/components/flashcards/CandidateCard.tsx` (new)

**Intent**: One candidate's accept/edit/reject UI and its own save call — mirrors `FlashcardListItem`'s local `isEditing`/`isSubmitting`/`error` state shape exactly, but against the create endpoint instead of update/delete.

**Contract**: Props `{ candidate: FlashcardCandidate; onAccepted: () => void; onRejected: () => void }`. Local `question`/`answer` state initialized from `candidate`, plus `isEditing`, `isSubmitting`, `error` — same shape as `FlashcardListItem`. "Reject" calls `onRejected()` directly with no network call. "Accept" (whether or not the card is mid-edit) POSTs the **current** local `question`/`answer` values to `/api/flashcards` (the existing S-03 endpoint, `CreateFlashcardCommand` shape) and calls `onAccepted()` on 2xx; a non-2xx response sets `error` and leaves the card in place so the user can retry or edit further. This is what satisfies the PRD's "edited candidates are saved with the user's edits, not the original AI output" — there's no separate "save edit" step, only Accept.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- Pasting valid study text and clicking Generate shows a loading state, then a list of candidates
- Accepting a candidate as-is saves it (verify it now appears on `/flashcards`) and removes it from the review list
- Editing a candidate's question/answer before accepting saves the edited text, not the original (verify on `/flashcards`)
- Rejecting a candidate removes it from the list with no network request (verify via browser devtools network tab)
- Pasting text with no extractable facts (e.g. a short nonsense string above the 20-char minimum) shows the "no flashcards could be generated" message, not an error
- Pasting empty text or text under 20 characters shows the inline validation message and does not call the API
- Pasting text over 10,000 characters shows the inline validation message and does not call the API
- Triggering a generation failure (e.g. temporarily bad `OPENROUTER_API_KEY` from Phase 1's manual test) shows a generic error message with the input text still present, and clicking Generate again retries cleanly

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

None — no test framework exists in this repo (confirmed absent from `package.json`); consistent with S-03's precedent, this change ships with manual verification only.

### Integration Tests:

None (see above).

### Manual Testing Steps:

See each phase's Manual Verification list above; Phase 2's list is the end-to-end path.

## Performance Considerations

Per `infrastructure.md`'s risk register, the AI-generation route must keep local text processing minimal before the OpenRouter call to stay within Cloudflare Workers' CPU-ms budget — Phase 1's length cap (10,000 chars) and the absence of any chunking/pre-processing step are the guardrails against this.

## Migration Notes

None — no schema changes.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-02 / `ai-generated-flashcard-review`)
- PRD: `context/foundation/prd.md` (FR-003, FR-004, US-01)
- Reused endpoint: `src/pages/api/flashcards/index.ts` (POST handler)
- Pattern reference: `context/changes/manual-flashcard-management/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Backend — OpenRouter integration and generate endpoint

#### Automated

- [x] 1.1 Type checking passes: `npm run lint` — fec3cdb
- [x] 1.2 Build succeeds: `npm run build` — fec3cdb

#### Manual

- [x] 1.3 Unauthenticated request to `/api/flashcards/generate` returns 401 — fec3cdb
- [x] 1.4 Empty/too-short text returns 400 validation_error — fec3cdb
- [x] 1.5 Too-long text (>10,000 chars) returns 400 validation_error — fec3cdb
- [x] 1.6 Valid text returns 200 with plausible candidates — fec3cdb
- [x] 1.7 Broken API key returns 502 generation_failed, not a silent 500/hang — fec3cdb
- [x] 1.8 Confirm OPENROUTER_MODEL resolves on OpenRouter's catalog and supports response_format: json_schema — fec3cdb
- [x] 1.9 OPENROUTER_API_KEY added to local .dev.vars before testing npm run dev — fec3cdb
- [x] 1.10 Missing-key banner shows on any page when OPENROUTER_API_KEY is unset — fec3cdb
- [ ] 1.11 wrangler secret put OPENROUTER_API_KEY run before production deploy

### Phase 2: Frontend — generation page and candidate review

#### Automated

- [x] 2.1 Type checking passes: `npm run lint` — d556f37
- [x] 2.2 Build succeeds: `npm run build` — d556f37

#### Manual

- [x] 2.3 Generate shows loading state then candidate list — d556f37
- [x] 2.4 Accepting a candidate as-is saves it and removes it from the review list — d556f37
- [x] 2.5 Editing before accepting saves the edited text, not the original — d556f37
- [x] 2.6 Rejecting removes the candidate with no network request — d556f37
- [x] 2.7 Unusable input (no extractable facts) shows the "no flashcards generated" message — d556f37
- [x] 2.8 Empty/too-short input shows inline validation, no API call — d556f37
- [x] 2.9 Too-long input shows inline validation, no API call — d556f37
- [x] 2.10 Generation failure shows generic error, text preserved, retry works — d556f37
