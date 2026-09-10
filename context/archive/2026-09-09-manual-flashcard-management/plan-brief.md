# Manual Flashcard CRUD — Plan Brief

> Full plan: `context/changes/manual-flashcard-management/plan.md`

## What & Why

Give users full manual control over their own flashcards — create, view, edit, and delete — without going through AI generation. Roadmap slice S-03, covering FR-005 through FR-008. First feature to consume the `flashcards` table (F-01) through a real UI, and the first domain (non-auth) API surface in the codebase.

## Starting Point

`flashcards` table exists with RLS and CHECK constraints (F-01); `Flashcard` entity type exists in `src/types.ts`; the only existing UI/API pattern is auth's form-POST-and-redirect flow. No service layer, no JSON API, no client-side data fetching exists anywhere yet, and only `button.tsx` is installed from shadcn/ui.

## Desired End State

A logged-in user visits `/flashcards`, sees their existing flashcards (or a helpful empty state), creates one via an always-visible form, edits any flashcard inline, and deletes one after confirming in a dialog — all without a full page reload after the initial visit.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Interaction model | React island + fetch to JSON API | Per-row edit/delete without full page reloads; first JSON API in the codebase, distinct from auth's form+redirect pattern. |
| List view | No pagination, sorted by created_at desc | PRD's target scale is small; full list rendering is simplest and sufficient. |
| Create UX | Always-visible form above the list | One screen, zero navigation for the most frequent action. |
| Edit UX | Inline in the list | Fastest edit path; consistent with the React+fetch architecture. |
| Delete UX | shadcn Dialog confirmation | Protects against accidental loss — matches PRD's guardrail that flashcard data must never be lost. |
| Validation | Client-side mirror + server maps Postgres 23514 | Fast feedback plus a hard guarantee at the API layer per CLAUDE.md's error-shape convention. |
| Query scoping | Rely on RLS (session-scoped client, no explicit user_id filter) | Single source of truth for access control; matches how `createClient()` already works everywhere else. |
| Empty state | Helpful message pointing at the create form | Guides new users to their first action at near-zero cost. |
| Error feedback | Inline error message per owning component, reusing `ServerError.tsx`'s pattern | Plan review (F1) caught that the server-side validation fallback had no path to the user's screen — every API-call failure surface now has an explicit display contract. |
| Pending-state UX | Local `isSubmitting` `useState` per component, not `SubmitButton`/`useFormStatus` | Plan review (second pass, F1) confirmed `useFormStatus()` only works for native/Action-based form submits, not this plan's manual `fetch()` calls — reusing it would silently never show pending state. |

## Scope

**In scope:** service layer (`flashcards.service.ts`), two API route files (list/create, update/delete-by-id), `/flashcards` page, create form, inline edit, delete dialog, dashboard link, shadcn Input/Textarea/Dialog install.

**Out of scope:** pagination, search/filter/sort options, bulk operations, optimistic UI updates, automated tests, anything AI-generation related (S-02).

## Architecture / Approach

Backend-first: a thin service module wraps all Supabase queries (list/create/update/delete), two API route files expose it as JSON (`GET`/`POST /api/flashcards`, `PATCH`/`DELETE /api/flashcards/[id]`), each checking `context.locals.user` for a `401` JSON response. Frontend: the Astro page SSR-fetches the initial list directly through the same service (no self-referential HTTP call), then a React island (`FlashcardManager` + `CreateFlashcardForm` + `FlashcardListItem`) handles all further create/edit/delete interaction via `fetch()`, updating local state only after each API call succeeds.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Backend | Service layer + JSON API (list/create/update/delete), RLS-scoped, CHECK-violation mapped to `{ error: { code, message } }` | RLS insert requires explicitly setting `user_id`; update/delete on a not-yours row returns zero rows, not an error — both called out in Critical Implementation Details |
| 2. Frontend | `/flashcards` page + React island (create, inline edit, delete dialog, empty state) + dashboard link | First React-island-with-fetch pattern in the codebase — more client state to get right than auth's form+redirect flow |

**Prerequisites:** F-01 (minimal-flashcard-schema) and S-01 (account-signup-and-login) — both implemented and impl-reviewed.
**Estimated effort:** ~2 sessions across 2 phases.

## Open Risks & Assumptions

- Assumes a single Postgres error code (`23514`) covers all CHECK-constraint violations on this table — true today (only the two length constraints exist), but a future migration adding more constraints would need the same mapping extended.
- No automated regression coverage — future changes to `flashcards.service.ts` rely on the manual verification steps being re-run, same precedent as every prior slice in this project.

## Success Criteria (Summary)

- A user can create, view, edit, and delete their own flashcards entirely through `/flashcards`, with no cross-user data leakage.
- Invalid input (empty or >2000-char question/answer) is caught client-side before submission and server-side as a fallback, never as a raw 500.
- `npm run lint` and `npm run build` pass throughout.
