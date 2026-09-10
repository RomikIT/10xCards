# Minimal Flashcard Data Schema — Plan Brief

> Full plan: `context/changes/minimal-flashcard-schema/plan.md`

## What & Why

Add the first application table to 10xCards: a minimal `flashcards` table (question, answer, owner `user_id`, timestamps) with per-user row-level-security policies. This is the foundation roadmap item (F-01) — every downstream slice (AI generation, manual CRUD, spaced repetition) needs somewhere to persist and query flashcards scoped to their owner.

## Starting Point

No application tables exist yet — only Supabase Auth's built-in `auth.users`. No `supabase/migrations/` directory, no `src/types.ts`. Auth is fully wired (signup/signin/signout work), so `auth.uid()` is available for RLS immediately.

## Desired End State

A `flashcards` table exists with RLS enabled and four granular per-operation policies scoped to the owning user, plus a `Flashcard` TypeScript type in `src/types.ts` ready for later slices to import.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Primary key type | `uuid` (`gen_random_uuid()`) | Consistent with `auth.users.id` (also uuid); no record-count leakage. | Plan |
| `updated_at` maintenance | DB trigger (`public.set_updated_at()`) | Guarantees correctness regardless of which future caller updates a row. | Plan |
| FK on user deletion | `ON DELETE CASCADE` | Matches PRD's single-tenant/single-owner model — orphaned flashcards have no meaning. | Plan |
| `question`/`answer` constraints | `NOT NULL` + length check (1–2000 chars, trimmed) | Guards against empty and pathologically long content at the DB layer. | Plan |
| TypeScript type scope | Hand-written `Flashcard` in `src/types.ts` only | Matches CLAUDE.md convention; full `Database` type generation is unnecessary infra for a foundation slice. | Plan |
| RLS policy shape | 4 separate per-operation policies (not one blanket `FOR ALL`) | CLAUDE.md mandates granular per-operation, per-role policies. | Plan |

## Scope

**In scope:**
- `flashcards` table migration (columns, constraints, index, trigger, RLS)
- `Flashcard` type in `src/types.ts`

**Out of scope:**
- SRS scheduling columns (F-02)
- Any API route, service layer, or UI (S-02, S-03)
- `Database` type generation / typed Supabase client generic
- Deck/tag/category entities
- Soft-delete or archival on user deletion

## Architecture / Approach

One SQL migration creates the table, RLS policies, a reusable `updated_at` trigger function, and a supporting index on `user_id`. One TypeScript type mirrors the row shape. No application code consumes the table yet, so verification happens directly against Postgres (Supabase Studio SQL editor) rather than through an API.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Migration | `flashcards` table + RLS + trigger + index | RLS misconfiguration silently leaking cross-user data — mitigated by explicit two-user manual verification |
| 2. TypeScript type | `Flashcard` type in `src/types.ts` | Type drifting from schema over time (no generated-type safety net yet) |

**Prerequisites:** Local Supabase running (`npx supabase start`, requires Docker) to apply and verify the migration.
**Estimated effort:** ~1 session, 2 small phases.

## Open Risks & Assumptions

- No generated `Database` type means the `Flashcard` type can silently drift from the actual schema if a future migration changes a column without updating `src/types.ts` — accepted tradeoff for this foundation slice; revisit if drift becomes a real problem.
- RLS correctness is verified manually (no API/tests exist yet to automate this) — the two-user manual check in Phase 1 is the only safety net until S-02/S-03 add automated tests against real endpoints.

## Success Criteria (Summary)

- The `flashcards` table exists with RLS enabled and one user can never see, edit, or delete another user's flashcards.
- `npm run build` and `npm run lint` pass with the new `Flashcard` type in place.
- Deleting a user cascades to delete their flashcards; empty or oversized `question`/`answer` values are rejected at the DB layer.
