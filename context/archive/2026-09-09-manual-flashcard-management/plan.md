# Manual Flashcard CRUD Implementation Plan

## Overview

Give users full manual control over their own flashcards — create, view, edit, and delete — without going through AI generation. This is roadmap slice S-03, covering FR-005 through FR-008. It's the first feature in the project to consume the `flashcards` table (F-01) through a real UI and the first domain API surface in the codebase (today only `src/pages/api/auth/*` exists).

## Current State Analysis

- `flashcards` table exists (`supabase/migrations/20260909090431_create_flashcards_table.sql`) with RLS enabled: four granular policies scoped to `auth.uid() = user_id`, a `flashcards_user_id_idx` index, and CHECK constraints requiring `question`/`answer` to be 1–2000 characters after trimming.
- `src/types.ts` has `Flashcard` (id, user_id, question, answer, created_at, updated_at) — no command/DTO types yet.
- `src/lib/supabase.ts` exports `createClient()` (session-scoped, RLS-enforcing) and `callSupabaseAuth()` (generic try/catch-and-log wrapper, not specific to auth despite its name).
- `src/middleware.ts` protects `/dashboard` only (`PROTECTED_ROUTES = ["/dashboard"]`); `context.locals.user` is populated on every request.
- Only one shadcn/ui component is installed (`src/components/ui/button.tsx`) — no `Input`, `Textarea`, or `Dialog` yet.
- The only existing UI/API pattern is auth's form-POST-and-redirect flow (`SignUpForm.tsx` → `signup.ts` → full-page redirect). No JSON API, no client-side data fetching, and no service-layer module exist anywhere in the codebase yet.
- `dashboard.astro` reads `Astro.locals.user` directly with no extra auth guard, trusting the middleware's redirect — the pattern this plan's new page follows.

## Desired End State

A logged-in user can visit `/flashcards`, see their existing flashcards (or a helpful empty state if they have none), create a new one via an always-visible form, edit any flashcard inline without leaving the page, and delete one after confirming in a dialog — all without a full page reload after the initial visit. Every operation is scoped to the caller's own flashcards via RLS.

**Verification**: `npm run lint` and `npm run build` pass; each API endpoint verified directly via curl (auth boundary, CRUD happy path, validation-error mapping); the full create → edit → delete flow exercised manually in the browser against `npm run dev`.

### Key Discoveries:

- `src/lib/supabase.ts:5-8`'s `createClient()` already returns a session-scoped client whose queries are RLS-filtered automatically — no service function needs to pass or check `user_id` for reads, updates, or deletes.
- The `flashcards_insert_own` RLS policy's `WITH CHECK (auth.uid() = user_id)` does **not** populate `user_id` automatically — the insert payload must set it explicitly, or the RLS check itself rejects the row (see Critical Implementation Details).
- `supabase/migrations/20260909090431_create_flashcards_table.sql`'s CHECK constraints (`flashcards_question_length`, `flashcards_answer_length`) surface as Postgres error code `23514` from the Supabase JS client — this plan is the first to actually build the catching/mapping logic that F-01's plan flagged as a downstream obligation.

## What We're NOT Doing

- No pagination — PRD's `target_scale.data_volume` is `small`; the full list renders at once, sorted by `created_at` descending.
- No search, filtering, sorting options, or bulk operations (multi-select delete, etc.) — not required by FR-005–FR-008.
- No optimistic UI updates before the server confirms — local state updates only after a successful API response, keeping error handling simple (no rollback logic needed).
- No automated tests — no test framework exists in this repo (consistent with every prior slice's plan).
- No changes to the AI-generation path — that's S-02, a separate change.

## Implementation Approach

Two phases: a backend phase (service layer + JSON API routes) that's independently verifiable via curl, then a frontend phase (a React island consuming that API) built on top of it. The API is a real JSON API (not the form-POST-and-redirect pattern auth uses) — a list with per-row inline edit and delete needs client-side interactivity, so a React island calling `fetch()` is the natural fit; the initial list itself is still SSR-rendered (fetched directly in the Astro page, same session-scoped client) to avoid a loading spinner on first paint.

## Critical Implementation Details

**RLS insert requires an explicit `user_id`**: unlike SELECT/UPDATE/DELETE (which RLS filters transparently), the insert policy's `WITH CHECK` only *validates* `auth.uid() = user_id` — it doesn't fill the column in. The create service function must set `user_id: <the authenticated user's id>` in the insert payload itself (from `context.locals.user.id` in the route handler), or every insert fails RLS with a generic policy-violation error instead of succeeding.

**UPDATE/DELETE on a nonexistent-or-not-yours row returns zero rows, not an error**: RLS silently filters rows the caller doesn't own — `.update(...).eq("id", id).select()` or `.delete().eq("id", id).select()` returns an empty array with no Postgres error when `id` doesn't exist or belongs to another user. The service functions must treat "empty result array" as a distinct not-found case so the route can return `404`, rather than treating it as a silent no-op success.

**`SubmitButton.tsx`'s `useFormStatus()` doesn't transfer to this plan's fetch-based components**: `useFormStatus()` only reports a non-idle `pending` state for a `<form>` submitted natively (a real `action="url"` causing browser navigation, as auth's forms do) or via React 19's `action={fn}` Actions prop — never for a `<form onSubmit={handler}>` where `handler` calls `preventDefault()` and issues a manual `fetch()`, which is this plan's architecture. `CreateFlashcardForm` and `FlashcardListItem` must track their own `isSubmitting` state via `useState` instead of reusing `SubmitButton` as-is.

## Phase 1: Backend — service layer and JSON API routes

### Overview

Adds the shared command types, a `flashcards.service.ts` module encapsulating all Supabase queries, and two API route files providing list/create/update/delete over JSON, all scoped to the caller via RLS and the session-scoped Supabase client.

### Changes Required:

#### 1. Command types

**File**: `src/types.ts`

**Intent**: Shared request-body shapes for the create and update endpoints, per CLAUDE.md's "Shared types (entities, DTOs) go in `src/types.ts`" convention.

**Contract**: Add `export interface CreateFlashcardCommand { question: string; answer: string; }` and `export interface UpdateFlashcardCommand { question: string; answer: string; }` (full replace on update, not a partial patch — matches the inline-edit UX where both fields are saved together in one action).

#### 2. Flashcards service

**File**: `src/lib/services/flashcards.service.ts`

**Intent**: Encapsulate all `flashcards` table queries behind small functions so the API route handlers stay thin, per CLAUDE.md's "Services/helpers go in `src/lib/services/` for extracted business logic." Also centralizes the CHECK-constraint-violation mapping that F-01's plan flagged as an obligation for whichever slice builds the first insert/update path.

**Contract**: Exports, each taking a `SupabaseClient` (from `createClient()`) as its first argument:
- `listFlashcards(supabase)` — `select("*").order("created_at", { ascending: false })`; returns `{ data: Flashcard[] }` or a mapped `{ error: { code: string; message: string } }` on an unexpected Supabase error.
- `createFlashcard(supabase, userId: string, command: CreateFlashcardCommand)` — inserts `{ user_id: userId, question: command.question, answer: command.answer }`, `.select().single()`; on success returns `{ data: Flashcard }`; on Postgres `23514` returns `{ error: { code: "validation_error", message: "Question and answer must be between 1 and 2000 characters." } }`; on any other error, `{ error: { code: "internal_error", message: "Something went wrong. Please try again." } }` (reusing the generic-message convention from `auth-error-handling-hardening`).
- `updateFlashcard(supabase, id: string, command: UpdateFlashcardCommand)` — `.update({ question: command.question, answer: command.answer }).eq("id", id).select()`; returns `{ data: Flashcard }` on a 1-row result, `{ notFound: true }` on a 0-row result (see Critical Implementation Details), or the same `23514`/generic error mapping as create.
- `deleteFlashcard(supabase, id: string)` — `.delete().eq("id", id).select()`; returns `{ ok: true }` on a 1-row result, `{ notFound: true }` on a 0-row result, or a generic-error mapping on an unexpected failure.

#### 3. List/create API route

**File**: `src/pages/api/flashcards/index.ts`

**Intent**: `GET` lists the caller's flashcards; `POST` creates one. Both require an authenticated session — this is a JSON API, so an unauthenticated request gets a `401` JSON body, not a redirect (unlike the page route, which the middleware protects with a redirect). Note: Phase 2's `flashcards.astro` fetches its initial list via the `listFlashcards` service function directly, not via this `GET` route — `GET` is kept for REST completeness and future consumers (a future refresh action, S-02's read path, external API use), not because Phase 2's UI calls it today.

**Contract**: `export const GET: APIRoute` and `export const POST: APIRoute`. Each checks `context.locals.user`; if absent, returns `401` with `{ error: { code: "unauthorized", message: "..." } }`. Builds the client via `createClient(context.request.headers, context.cookies)`. `GET` calls `listFlashcards` and returns `200 { flashcards: [...] }` (or the service's mapped error as `500`). `POST` parses the JSON body, does a minimal type/non-empty guard on `question`/`answer` before calling `createFlashcard` (the real length enforcement is the DB's CHECK constraint via the service's `23514` mapping), and returns `201 { flashcard: {...} }` on success or the appropriate error status (`400` for `validation_error`, `500` for `internal_error`).

#### 4. Single-flashcard API route

**File**: `src/pages/api/flashcards/[id].ts`

**Intent**: `PATCH` edits one flashcard, `DELETE` removes one, both scoped by the dynamic `id` route param.

**Contract**: `export const PATCH: APIRoute` and `export const DELETE: APIRoute`, same `401` auth guard as above. `PATCH` parses the JSON body, calls `updateFlashcard(supabase, context.params.id, command)`; returns `200 { flashcard: {...} }`, `404 { error: { code: "not_found", message: "Flashcard not found." } }` on the service's `notFound` result, or the validation/internal error mapping. `DELETE` calls `deleteFlashcard`; returns `204` with no body on success, or the same `404` mapping.

#### 5. Protect the new page route

**File**: `src/middleware.ts`

**Intent**: The `/flashcards` page (built in Phase 2) needs the same unauthenticated-redirect behavior `/dashboard` already gets.

**Contract**: `const PROTECTED_ROUTES = ["/dashboard", "/flashcards"];` — the API routes under `/api/flashcards/*` are intentionally **not** added here; they handle their own `401` JSON response per-route instead of a redirect, since a `fetch()` caller can't follow a redirect to an HTML sign-in page usefully.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- Unauthenticated `GET /api/flashcards` returns `401` with `{ error: { code, message } }`.
- Authenticated `POST /api/flashcards` with valid question/answer returns `201` with the created flashcard; a subsequent `GET /api/flashcards` includes it.
- `POST` with an empty or all-whitespace `question` returns a `validation_error` response (via the `23514` mapping), not a raw Postgres error or a `500`.
- `PATCH /api/flashcards/[id]` updates the row; `GET` reflects the change; `updated_at` changes.
- `DELETE /api/flashcards/[id]` removes the row; a subsequent `GET` no longer includes it; a second `DELETE` on the same id returns `404`.
- A second test user cannot `PATCH`/`DELETE`/see the first user's flashcard via these routes (RLS scoping holds through the new API layer, not just at the DB layer where F-01 already verified it).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Frontend — flashcards page and React components

### Overview

Adds the `/flashcards` page (SSR initial list) and the React island that renders the create form, the list with inline per-row editing, and the delete-confirmation dialog — all driven by the Phase 1 API.

### Changes Required:

#### 1. shadcn/ui components

**File**: `src/components/ui/` (new: `input.tsx`, `textarea.tsx`, `dialog.tsx`)

**Intent**: This plan is the first to need text-entry and dialog primitives beyond the existing `button.tsx`.

**Contract**: Install via `npx shadcn@latest add input textarea dialog`, per CLAUDE.md's "Install new ones with `npx shadcn@latest add [name]`." No hand-written contract — the CLI scaffolds these.

#### 2. Flashcards page

**File**: `src/pages/flashcards.astro`

**Intent**: Protected page; SSR-fetches the caller's current flashcards directly (same session-scoped client, no extra network round-trip) so the list is present on first paint, then hands off to the React island for all further interaction.

**Contract**: Uses `Layout.astro` like `dashboard.astro`. In frontmatter: build the client via `createClient(Astro.request.headers, Astro.cookies)`, call `listFlashcards(supabase)` directly (reusing the Phase 1 service — no self-referential HTTP call). On `{ data }`, render `<FlashcardManager client:load initialFlashcards={data} />`. On `{ error }`, render `<FlashcardManager client:load initialFlashcards={[]} initialError={error.message} />` — an empty list plus the same error message the manager would show for a failed mutation, rather than letting an unspecified shape reach the component. Trusts `Astro.locals.user` is non-null without an extra guard, matching `dashboard.astro`'s existing pattern (the middleware's `PROTECTED_ROUTES` redirect is the guard).

#### 3. Flashcard manager island

**File**: `src/components/flashcards/FlashcardManager.tsx`

**Intent**: Owns the list state and the empty-state decision; renders the create form and the list of items; all `fetch()` calls to the Phase 1 API live here or are passed down as handlers.

**Contract**: `interface Props { initialFlashcards: Flashcard[]; initialError?: string | null }`. Local state seeded from `initialFlashcards`. If `initialError` is set, renders it via the same inline error-message component described below (see Error handling), above the (still-usable) create form — a failed initial load doesn't block creating a first flashcard. `handleCreate`/`handleUpdate`/`handleDelete` call the corresponding API route; on a successful response, update local state (append/replace/remove) — no refetch of the whole list. On a non-2xx response or a thrown network error, the call rejects and the calling component (see `CreateFlashcardForm`/`FlashcardListItem` below) is responsible for displaying its own error — `FlashcardManager` does not swallow or catch these itself, it only owns state for the ones it's responsible for (its own SSR-load error). When `flashcards.length === 0` and there's no error, renders a message pointing at the (always-visible) create form instead of an empty list.

**Error handling (applies to this and the two components below)**: reuse `ServerError.tsx`'s pattern — a small component rendering an error string with an alert icon, styled consistently with the auth flow — for every API-call failure surface in this phase (SSR-load error here, create error in `CreateFlashcardForm`, update/delete error in `FlashcardListItem`). Each owning component keeps its own local `error: string | null` state, cleared on that component's next successful action.

#### 4. Create form

**File**: `src/components/flashcards/CreateFlashcardForm.tsx`

**Intent**: Always-visible form above the list for creating a new flashcard.

**Contract**: `interface Props { onCreate: (command: CreateFlashcardCommand) => Promise<void> }`. Two `Textarea` fields (question, answer — both potentially multi-line study content, so `Textarea` for both rather than `Input` for question). Live character-count validation mirroring the DB's 1–2000-trimmed-length constraint (same live-feedback style as `SignUpForm.tsx`'s password-length hint), blocking submit when out of range. Own local `error: string | null` state: on `onCreate` rejecting (non-2xx response or thrown network error), set it to the response's `error.message` (or a generic fallback for a network-level throw) and render via the shared error component (see `FlashcardManager`'s Error handling note); clear it at the start of the next submit attempt. Clears both fields after a successful `onCreate`. Own local `isSubmitting: boolean` state, set before calling `onCreate` and cleared in a `finally` block; the submit button is disabled and shows pending text (`"Creating..."`) while true — this plan does **not** reuse `SubmitButton.tsx`, since that component's `useFormStatus()` only tracks natively-submitted or React-Action forms, not a manually-wired `onSubmit` + `fetch()` (see Critical Implementation Details).

#### 5. Flashcard list item

**File**: `src/components/flashcards/FlashcardListItem.tsx`

**Intent**: One flashcard, toggling between display and inline-edit mode; owns its own delete-confirmation dialog.

**Contract**: `interface Props { flashcard: Flashcard; onUpdate: (id: string, command: UpdateFlashcardCommand) => Promise<void>; onDelete: (id: string) => Promise<void>; }`. Local `isEditing` boolean, local `error: string | null` state (shared between update and delete failures, since only one of those actions can be in flight for a given item at a time), and local `isSubmitting: boolean` state (also shared between update and delete, same reasoning) — set before calling `onUpdate`/`onDelete` and cleared in a `finally` block, disabling the relevant button(s) (Save, or the dialog's Confirm) while true. Display mode: question/answer text plus Edit/Delete buttons. Edit mode: the same `Textarea` fields (pre-filled, same length validation as the create form) plus Save/Cancel; on `onUpdate` rejecting, set `error` and render it inline within the item (via the shared error component) without leaving edit mode, so the user's in-progress edit isn't lost. Delete opens a shadcn `Dialog` ("Delete this flashcard? This can't be undone.") before calling `onDelete`; on `onDelete` rejecting, close the dialog and render the error inline on the item (display mode, since the row itself wasn't removed). `error` clears at the start of the next edit or delete attempt.

#### 6. Dashboard entry point

**File**: `src/pages/dashboard.astro`

**Intent**: `/flashcards` needs to be reachable from somewhere in the UI, not just a known URL — FR-006 ("user can view their list of saved flashcards") implies discoverability.

**Contract**: Add a link/button to `/flashcards` alongside the existing sign-out form, styled consistently with the page's existing glass/cosmic aesthetic.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- Visiting `/flashcards` while signed out redirects to `/auth/signin` (middleware).
- With zero flashcards, the empty-state message renders instead of a bare empty list.
- Creating a flashcard via the form adds it to the list without a full page reload; the create form clears.
- Submitting an out-of-range (empty or >2000-char) question/answer is blocked client-side with a visible message before any request is sent.
- Clicking Edit on a flashcard switches it to inline edit mode; Save persists the change and returns to display mode; Cancel discards the edit without calling the API.
- Clicking Delete opens the confirmation dialog; confirming removes the flashcard from the list; cancelling leaves it untouched.
- The new link on `/dashboard` navigates to `/flashcards`.
- Simulating a failed create/edit/delete (e.g., temporarily stopping the local Supabase instance, or editing the service to force an error) shows the inline error message on the relevant component instead of a silent no-op; a subsequent successful action clears it.
- Rapidly double-clicking Save (create or edit) or the delete dialog's Confirm button results in exactly one request, not two — the button is disabled and shows pending text for the duration of the in-flight request.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to close out the change.

---

## Testing Strategy

### Manual Testing Steps:

1. Phase 1's curl-based checks (auth boundary, CRUD happy path, validation-error mapping, cross-user RLS scoping).
2. Phase 2's full browser walkthrough: empty state → create → edit → delete, plus the client-side validation and dashboard link.

No automated unit/integration tests are added — no test framework exists in this repo.

## Performance Considerations

The existing `flashcards_user_id_idx` index (F-01) already covers the list query's access pattern (RLS-filtered by `user_id`, ordered by `created_at`). No new indexes or performance work needed at this scale.

## Migration Notes

Not applicable — no schema changes; this plan only adds application code on top of F-01's existing table.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-03)
- Table + RLS: `supabase/migrations/20260909090431_create_flashcards_table.sql`
- Prior downstream obligation: `context/changes/minimal-flashcard-schema/plan.md` ("Downstream obligation for S-02/S-03")
- Existing error-handling precedent: `context/changes/auth-error-handling-hardening/plan.md`
- Auth pattern (contrast): `src/pages/api/auth/signup.ts`, `src/components/auth/SignUpForm.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Backend — service layer and JSON API routes

#### Automated

- [x] 1.1 Lint passes: `npm run lint` — 8a987ed
- [x] 1.2 Build succeeds: `npm run build` — 8a987ed

#### Manual

- [x] 1.3 Unauthenticated GET returns 401 — 8a987ed
- [x] 1.4 POST creates a flashcard, visible in subsequent GET — 8a987ed
- [x] 1.5 POST with invalid question/answer returns validation_error, not a raw error — 8a987ed
- [x] 1.6 PATCH updates a flashcard, updated_at changes — 8a987ed
- [x] 1.7 DELETE removes a flashcard; second DELETE returns 404 — 8a987ed
- [x] 1.8 Cross-user RLS scoping verified through the API layer — 8a987ed

### Phase 2: Frontend — flashcards page and React components

#### Automated

- [x] 2.1 Lint passes: `npm run lint` — 80ee4fb
- [x] 2.2 Build succeeds: `npm run build` — 80ee4fb

#### Manual

- [x] 2.3 Signed-out visit to /flashcards redirects to signin — 80ee4fb
- [x] 2.4 Empty state renders with zero flashcards — 80ee4fb
- [x] 2.5 Create flow works without full page reload — 80ee4fb
- [x] 2.6 Client-side length validation blocks out-of-range submissions — 80ee4fb
- [x] 2.7 Inline edit (Save/Cancel) works correctly — 80ee4fb
- [x] 2.8 Delete confirmation dialog works correctly — 80ee4fb
- [x] 2.9 Dashboard link to /flashcards works — 80ee4fb
- [x] 2.10 Simulated create/edit/delete failure shows inline error, clears on next success — 80ee4fb
- [x] 2.11 Double-click on Save/Confirm-delete sends exactly one request; button shows disabled/pending state meanwhile — 80ee4fb
