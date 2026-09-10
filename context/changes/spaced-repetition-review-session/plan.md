# Spaced-Repetition Review Session Implementation Plan

## Overview

Implement S-04: users can start a review session where due flashcards — scheduled by `ts-fsrs` (FSRS v6) — are served one at a time, grade their recall on a 4-level scale, and have the schedule updated accordingly. This closes FR-009/FR-010 and is the roadmap's north star: the second half of the product's value proposition (AI-assisted generation + a real spaced-repetition engine).

## Current State Analysis

- `flashcards` table (F-01, migration `20260909090431_create_flashcards_table.sql`) has exactly 6 columns (`id`, `user_id`, `question`, `answer`, `created_at`, `updated_at`) — no scheduling state. Its header comment explicitly defers SRS columns to this slice.
- `src/lib/services/flashcards.service.ts` is a flat CRUD service returning tagged unions (`{data}` / `{error: ServiceError}` / `{notFound: true}`); `src/pages/api/flashcards/{index,[id]}.ts` are the handler skeleton (401 auth guard → `createClient()` null-check → 500 → validate body → delegate to service → map result to status).
- `src/pages/flashcards.astro` (list/manage) and `src/pages/flashcards/generate.astro` (AI generation) are both SSR pages that fetch initial data server-side and hydrate a React island with `client:load`; both live under the `/flashcards` prefix, which `PROTECTED_ROUTES` (`src/middleware.ts:4`) already covers via `.startsWith()`.
- `ts-fsrs` is confirmed compatible with the Cloudflare Workers runtime and the project's Node/TS setup (see `research.md`); not yet installed.
- No `formatDate()` helper exists yet in `src/lib/utils.ts` (only `cn()`).
- No test framework exists; prior slices (S-02, S-03) shipped with manual curl + browser verification checklists.

## Desired End State

A signed-in user visiting `/flashcards/review` sees the next due flashcard's question, can reveal the answer, then grade recall on 4 levels (Again/Hard/Good/Easy). Grading persists the updated FSRS state to `flashcards` and advances to the next due card; when the queue is empty, the user sees a clear "nothing due" state with a way back to `/flashcards`. Newly created and pre-existing flashcards are immediately eligible for review (state `New`, due now).

**Verification**: create a flashcard, visit `/flashcards/review`, see it in queue, grade it with each of the 4 ratings across repeated visits, confirm `due`/`stability`/`state`/`reps` change in the DB and the card drops out of the queue until its new due date.

### Key Discoveries:

- `research.md:52` — suggested column mapping (`due`, `stability`, `difficulty`, `state`, `reps`, `lapses`, `scheduled_days`, `learning_steps`, `last_review`; `elapsed_days` skipped as deprecated).
- `ts-fsrs-api-docs.md:120-143` — Postgres/Supabase round-trips `due`/`last_review` as ISO strings and `state` as a string/number; `TypeConvert.card()` normalizes a raw row back into a typed `Card` before calling `scheduler.next()`.
- RLS is row-scoped (`auth.uid() = user_id`), not column-scoped — the existing 4 per-operation policies on `flashcards` already cover the new columns; no new policies needed.

## What We're NOT Doing

- No `review_logs` / per-review history table — not required for FR-009/FR-010; `ReviewLog` is explicitly optional per `ts-fsrs-api-docs.md:162`.
- No session size cap — a session serves all due cards for the user, no pagination/limit.
- No custom `fsrs()` scheduler configuration (retention target, fuzz, learning steps) — library defaults only.
- No binary/simplified rating UX — the UI exposes the full 4-level `Rating` enum (Again/Hard/Good/Easy) as-is.
- No explicit "activate this card" step for pre-existing flashcards — migration defaults make them immediately due.
- No changes to `flashcards.service.ts`'s existing CRUD functions, or to S-02/S-03 UI — this slice only adds new files/columns.

## Implementation Approach

One additive migration extends `flashcards` with FSRS state columns, defaulted to mirror `createEmptyCard()` output so both existing and newly-created rows are immediately due. A new `review.service.ts` wraps `ts-fsrs`, following the same tagged-union return convention as `flashcards.service.ts`. Two new API routes follow the existing handler skeleton exactly. A new SSR page + React island follows the `flashcards/generate.astro` + island pattern already established.

## Phase 1: Schema, dependency, and types

### Overview

Add the `ts-fsrs` dependency, extend `flashcards` with FSRS state columns, and update shared types to match.

### Changes Required:

#### 1. Install `ts-fsrs`

**File**: `package.json`

**Intent**: Add the spaced-repetition library as a runtime dependency.

**Contract**: `npm install ts-fsrs` adds it to `dependencies` (not `devDependencies`).

#### 2. New migration extending `flashcards`

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_add_flashcard_srs_columns.sql`

**Intent**: Add FSRS scheduling state to every flashcard row, defaulted so existing and new rows behave exactly like a fresh `createEmptyCard()` — immediately due, state `New`.

**Contract**: Additive `ALTER TABLE public.flashcards ADD COLUMN ...` for: `due timestamptz not null default now()`, `stability numeric not null default 0`, `difficulty numeric not null default 0`, `state smallint not null default 0` (0=New, matching `ts-fsrs` `State` enum), `reps integer not null default 0`, `lapses integer not null default 0`, `scheduled_days integer not null default 0`, `learning_steps integer not null default 0`, `last_review timestamptz null default null`. No RLS changes — existing per-operation policies already cover new columns (row-scoped, not column-scoped). Follow the existing migration's naming convention (`YYYYMMDDHHmmss_short_description.sql`) and add an index: `create index flashcards_user_due_idx on public.flashcards (user_id, due)` to support the due-queue query.

#### 3. Extend shared types

**File**: `src/types.ts`

**Intent**: Reflect the new columns on `Flashcard` and add the command type for grading a review.

**Contract**: `Flashcard` gains `due: string; stability: number; difficulty: number; state: number; reps: number; lapses: number; scheduled_days: number; learning_steps: number; last_review: string | null`. Add `GradeReviewCommand { rating: Rating }` importing `Rating` from `ts-fsrs`.

### Success Criteria:

#### Automated Verification:

- `ts-fsrs` present in `package.json` dependencies and `package-lock.json`
- Migration applies cleanly against local Supabase: `npx supabase db reset` (or equivalent local migration run)
- Type checking passes: `npx astro sync && npm run lint`

#### Manual Verification:

- Inspect a pre-existing flashcard row in Supabase Studio after migration — confirm `due <= now()` and `state = 0`
- Insert a new flashcard via the existing `/flashcards` UI and confirm it also gets the same defaults

---

## Phase 2: Review service

### Overview

Add the business-logic layer wrapping `ts-fsrs`, following the existing service conventions.

### Changes Required:

#### 1. `formatDate()` helper

**File**: `src/lib/utils.ts`

**Intent**: Provide the shared UTC date-formatting helper CLAUDE.md calls for, used by the due-queue query.

**Contract**: `formatDate(date: Date | string): string` returning an ISO 8601 UTC string — a thin, well-named wrapper so call sites stop constructing `new Date().toISOString()` inline.

#### 2. `review.service.ts`

**File**: `src/lib/services/review.service.ts`

**Intent**: Query the due-card queue and apply an FSRS grading transition to a single card, returning results in the same tagged-union shape as `flashcards.service.ts`.

**Contract**:
- `listDueFlashcards(supabase: SupabaseClient): Promise<{data: Flashcard[]} | {error: ServiceError}>` — selects rows where `due <= <now, via formatDate()>`, ordered by `due` ascending. RLS scopes rows to the caller automatically (same pattern as `listFlashcards`).
- `gradeFlashcardReview(supabase: SupabaseClient, id: string, rating: Rating): Promise<{data: Flashcard} | {notFound: true} | {error: ServiceError}>` — selects the current row by `id`; if absent, `{notFound: true}` (mirrors `updateFlashcard`'s not-found check). Converts the row into a `Card` via `TypeConvert.card()`, calls `fsrs().next(card, new Date(), rating)`, and persists the resulting `Card`'s fields (`due`, `stability`, `difficulty`, `state`, `reps`, `lapses`, `scheduled_days`, `learning_steps`, `last_review`) back onto the row via `.update(...).eq("id", id).select()`. Errors map through a **local, unexported `mapError()`-equivalent defined in `review.service.ts`** — `flashcards.service.ts`'s `mapError` is module-private and must not be imported; the local copy mirrors its `{code, message}` shape and its `23514`→`validation_error` mapping (in-process compute, no external provider — failures are `internal_error`, not the `generation_failed`/502 pattern used by the AI-generation service).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- N/A (covered by Phase 3/4 manual verification, which exercises this service through the API)

---

## Phase 3: Review API endpoints

### Overview

Expose the due-queue and grading operations as API routes following the existing handler skeleton.

### Changes Required:

#### 1. Due-queue endpoint

**File**: `src/pages/api/flashcards/review.ts`

**Intent**: Return the caller's due flashcards for a review session.

**Contract**: `GET` — 401 if `!context.locals.user`; 500 if `createClient()` returns `null`; delegate to `listDueFlashcards`; on `{error}` return 500 with `{error}`; on success `Response.json({ flashcards: result.data }, { status: 200 })`. Mirrors `GET /api/flashcards` exactly, minus the ordering difference (due-ascending vs. created-descending).

#### 2. Grading endpoint

**File**: `src/pages/api/flashcards/[id]/review.ts`

**Intent**: Grade one flashcard's review and persist the updated schedule.

**Contract**: `POST` — 401 guard, 500 `createClient()` guard, parse `Partial<GradeReviewCommand>` from JSON body (400 on parse failure), validate `body.rating` is exactly one of the 4 grading values `Rating.Again | Rating.Hard | Rating.Good | Rating.Easy` (400 `validation_error` otherwise — explicitly reject `Rating.Manual`, which is for administrative rescheduling, not user grading, and is never sent by this slice's UI), delegate to `gradeFlashcardReview(supabase, context.params.id, body.rating)`. On `{notFound: true}` → 404 `{error: {code: "not_found", ...}}`; on `{error}` → 500; on success → `Response.json({ flashcard: result.data }, { status: 200 })`. Mirrors the validate → delegate → map-status shape of `PATCH /api/flashcards/[id]`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- `curl` the due-queue endpoint (with a valid session cookie) and confirm it returns only cards with `due <= now`
- `curl` the grading endpoint with each of the 4 rating values on different cards and confirm the response reflects updated `due`/`stability`/`state`/`reps`
- Confirm grading a nonexistent id returns 404, and grading without auth returns 401

---

## Phase 4: Review session UI

### Overview

Add the review-session page and React island: serve the due queue, walk the user through question → reveal → grade → next card.

### Changes Required:

#### 1. Review page

**File**: `src/pages/flashcards/review.astro`

**Intent**: SSR-fetch the initial due queue (mirrors `flashcards.astro`'s SSR-fetch-then-hydrate pattern) and render the review island.

**Contract**: Server-side, call `listDueFlashcards` directly (same pattern as `flashcards.astro` calling `listFlashcards` directly, not via HTTP) to get `initialQueue`/`initialError`; render `<ReviewSession client:load initialQueue={...} initialError={...} />` inside the existing page shell (`Layout`, `bg-cosmic` container, back-link to `/flashcards`).

#### 2. `ReviewSession` component

**File**: `src/components/flashcards/ReviewSession.tsx`

**Intent**: Drive the per-card review loop: show the current card's question, a "Show answer" action that reveals the answer plus 4 rating buttons, and on grading, `POST` to the grading endpoint, drop the graded card from local queue state, and advance to the next card (or show an empty-queue state).

**Contract**: `Props { initialQueue: Flashcard[]; initialError?: string | null }`. Local state: remaining queue (array), `answerRevealed` (boolean, reset on each new current card), and `isSubmitting` (boolean) — mirroring `FlashcardListItem.tsx`'s existing pattern, all 4 rating buttons are disabled while `isSubmitting` is true so a double-click cannot fire two grading requests for the same card. Rating buttons call `POST /api/flashcards/${id}/review` with `{ rating }` for each of the 4 `Rating` values, matching the existing components' `fetch` + `extractErrorMessage` error-handling pattern from `FlashcardManager.tsx`. When the queue is empty (initially or after grading the last card), render a "You're all caught up" message with a link back to `/flashcards`.

#### 3. Navigation link

**File**: `src/pages/flashcards.astro`

**Intent**: Let users reach the review session from the flashcard management page.

**Contract**: Add a third link alongside the existing "Generate with AI →" / "← Dashboard" links, e.g. "Review due cards →" pointing at `/flashcards/review`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- Visit `/flashcards/review` with at least one due card; confirm question shows, answer is hidden until revealed, and all 4 rating buttons are present after reveal
- Grade a card with each rating in turn (across test cards) and confirm the queue advances without a full page reload
- Grade the last card in the queue and confirm the empty-queue state renders with a working link back to `/flashcards`
- Visit `/flashcards/review` with zero due cards and confirm the empty-queue state renders immediately
- Confirm unauthenticated access to `/flashcards/review` redirects to `/auth/signin` (via existing `PROTECTED_ROUTES` prefix match)

---

## Testing Strategy

### Unit Tests:

- No test framework exists in this repo (confirmed in research); this slice follows the established manual-verification pattern rather than introducing one.

### Integration Tests:

- N/A — covered by the manual `curl` + browser checklists in each phase's Manual Verification.

### Manual Testing Steps:

1. Create 2-3 flashcards via `/flashcards`, confirm each is immediately due (Phase 1 manual check).
2. Start a review session at `/flashcards/review`, grade each card once with a different rating (Again/Hard/Good/Easy), confirm the queue empties.
3. Inspect the DB rows to confirm `due` moved into the future, `reps` incremented, and `state` transitioned from `New`.
4. Grade a card with `Again` and confirm its `due` stays near-term (short relearning interval) versus `Easy` producing a longer interval.
5. Reload `/flashcards/review` with an empty queue and confirm the "all caught up" state.

## Performance Considerations

None beyond the added `flashcards_user_due_idx (user_id, due)` index — MVP data volumes are small (single-user, solo dev per roadmap context) and the due-queue query is a straightforward indexed range scan.

## Migration Notes

The new migration is purely additive (`ALTER TABLE ... ADD COLUMN ... DEFAULT ...`) — no backfill script needed since column defaults apply to existing rows automatically on Postgres. No data loss risk; rollback is `ALTER TABLE ... DROP COLUMN` for each added column if ever needed (not scripted here, consistent with no other migration in this repo having a down-migration).

## References

- Related research: `context/changes/spaced-repetition-review-session/research.md`
- API reference: `context/changes/spaced-repetition-review-session/ts-fsrs-api-docs.md`
- Library selection: `context/changes/spaced-repetition-review-session/srs-library-research.md`
- CRUD service to mirror: `src/lib/services/flashcards.service.ts`
- Handler skeleton to mirror: `src/pages/api/flashcards/index.ts:1-29`, `src/pages/api/flashcards/[id].ts`
- Page/island pattern to mirror: `src/pages/flashcards/generate.astro`, `src/pages/flashcards.astro`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Schema, dependency, and types

#### Automated

- [x] 1.1 ts-fsrs present in package.json dependencies and package-lock.json — d9088d5
- [x] 1.2 Migration applies cleanly against local Supabase — d9088d5
- [x] 1.3 Type checking passes — d9088d5

#### Manual

- [x] 1.4 Pre-existing flashcard row has due <= now() and state = 0 after migration — d9088d5
- [x] 1.5 Newly-created flashcard gets the same SRS defaults — d9088d5

### Phase 2: Review service

#### Automated

- [x] 2.1 Type checking passes
- [x] 2.2 Build succeeds

### Phase 3: Review API endpoints

#### Automated

- [ ] 3.1 Type checking passes
- [ ] 3.2 Build succeeds

#### Manual

- [ ] 3.3 Due-queue endpoint returns only cards with due <= now
- [ ] 3.4 Grading endpoint updates due/stability/state/reps for each of the 4 ratings
- [ ] 3.5 Grading a nonexistent id returns 404; unauthenticated request returns 401

### Phase 4: Review session UI

#### Automated

- [ ] 4.1 Type checking passes
- [ ] 4.2 Build succeeds

#### Manual

- [ ] 4.3 Review page shows question, hides answer until revealed, shows all 4 rating buttons after reveal
- [ ] 4.4 Grading each rating advances the queue without a full page reload
- [ ] 4.5 Grading the last card shows the empty-queue state with a working link back to /flashcards
- [ ] 4.6 Visiting the review page with zero due cards shows the empty-queue state immediately
- [ ] 4.7 Unauthenticated access to /flashcards/review redirects to /auth/signin
