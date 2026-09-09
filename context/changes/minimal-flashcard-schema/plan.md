# Minimal Flashcard Data Schema Implementation Plan

## Overview

Add the first application table to 10xCards: a minimal `flashcards` table (question, answer, owner `user_id`, timestamps) with per-user row-level-security policies. This is a foundation slice (roadmap F-01) — every downstream slice (S-02 AI generation, S-03 manual CRUD, F-02 SRS schema) needs somewhere to persist and query flashcards scoped to their owner.

## Current State Analysis

- No application tables exist yet. `supabase/seed.sql` explicitly documents this ("no custom tables yet, only Supabase Auth's built-in `auth.users` table").
- No `supabase/migrations/` directory exists.
- `src/lib/supabase.ts` creates a Supabase SSR client via `createServerClient()` with no `Database` generic — untyped queries.
- No `src/types.ts` exists yet (no shared entity/DTO types anywhere in the codebase).
- Auth is fully wired: `auth.users` is populated via the existing signup/signin flow (`src/pages/api/auth/*`), so `auth.uid()` is available in RLS policies immediately.

## Desired End State

A `flashcards` table exists in `public` schema with columns `id`, `user_id`, `question`, `answer`, `created_at`, `updated_at`, RLS enabled with four granular policies (select/insert/update/delete) scoped to `auth.uid() = user_id`, and a corresponding `Flashcard` TypeScript type in `src/types.ts`.

**Verification**: applying the migration to a local Supabase instance succeeds with no errors; querying the table as one authenticated user never returns another user's rows (verified directly against Postgres, since no API route consumes this table yet); `npm run build` and `npm run lint` pass with the new `Flashcard` type in place.

### Key Discoveries:

- `supabase/config.toml` (`[db.migrations]`, `sql_paths = ["./seed.sql"]`) confirms migrations run automatically on `supabase db reset`/`db push` — no extra wiring needed once the migration file exists.
- CLAUDE.md mandates the migration filename format `YYYYMMDDHHmmss_short_description.sql` and "granular per-operation, per-role" RLS policies — this plan follows both literally.
- `auth.users.id` is `uuid`, so `flashcards.user_id` must be `uuid` to FK against it cleanly — this also drove the primary-key type decision (uuid, for consistency with the rest of the schema).

## What We're NOT Doing

- No spaced-repetition/scheduling columns (due date, ease factor, interval) — those land in F-02 once the SRS library is chosen.
- No API routes, service layer, or UI for flashcards — those land in S-02 (AI generation) and S-03 (manual CRUD).
- No `Database` type generation (`supabase gen types typescript`) or wiring a generic into `createClient()` — deferred; a hand-written `Flashcard` type in `src/types.ts` is sufficient for this foundation slice per CLAUDE.md's "Shared types go in `src/types.ts`" convention.
- No deck/tag/category entities — out of scope per F-01's roadmap description ("kept intentionally minimal").
- No soft-delete or archival of flashcards on user-account deletion — deletion cascades (see Critical Implementation Details).

## Implementation Approach

A single SQL migration creates the table, its RLS policies, a reusable `updated_at` trigger function, and a supporting index — then a single TypeScript type mirrors the table shape for use by later slices. No application code consumes the table yet, so verification happens directly against Postgres (via Supabase Studio's SQL editor or `psql`) rather than through an API.

## Critical Implementation Details

**Reusable trigger function naming**: name the `updated_at` trigger function `public.set_updated_at()` (not `flashcards`-specific) — F-02 will extend this same table, and later slices may add more tables that want the identical behavior. Defining it generically now avoids a duplicate function migration later. Guard the migration with `CREATE OR REPLACE FUNCTION` so it's safe to re-declare if a future migration needs to touch it.

**RLS policy set**: four separate policies (`flashcards_select_own`, `flashcards_insert_own`, `flashcards_update_own`, `flashcards_delete_own`), each scoped to `TO authenticated` with `USING (auth.uid() = user_id)` (and `WITH CHECK (auth.uid() = user_id)` on insert/update) — not a single blanket `FOR ALL` policy. This is CLAUDE.md's explicit requirement, not a style preference: a single `FOR ALL` policy is harder to audit per-operation later (e.g. if a future slice needs a public read policy for shared decks, a blanket policy would need to be torn apart).

## Phase 1: Migration — flashcards table, RLS, trigger, index

### Overview

Creates the `flashcards` table and everything needed for it to be safely queryable per-user from day one.

### Changes Required:

#### 1. New migration file

**File**: `supabase/migrations/20260909090431_create_flashcards_table.sql`

**Intent**: Create the `flashcards` table with owner FK, enforce data integrity (non-null, non-empty, length-capped `question`/`answer`), auto-maintain `updated_at`, index for per-user lookups, and lock the table down with RLS so each user only ever sees their own rows.

**Contract**:
- Table `public.flashcards`: `id uuid primary key default gen_random_uuid()`, `user_id uuid not null references auth.users(id) on delete cascade`, `question text not null`, `answer text not null`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`.
- `CHECK` constraints on `question` and `answer`: length between 1 and 2000 characters after trimming (`char_length(trim(question)) between 1 and 2000`, same for `answer`) — rejects empty/whitespace-only content and pathologically long input at the DB layer.
- Index: `create index flashcards_user_id_idx on public.flashcards (user_id);`
- Trigger function `public.set_updated_at()` (generic, reusable — see Critical Implementation Details) + `create trigger flashcards_set_updated_at before update on public.flashcards for each row execute function public.set_updated_at();`
- `alter table public.flashcards enable row level security;`
- Four policies (see Critical Implementation Details for naming/shape): `flashcards_select_own`, `flashcards_insert_own`, `flashcards_update_own`, `flashcards_delete_own`, all `TO authenticated`, all scoped by `auth.uid() = user_id`.

#### 2. Update stale seed.sql comment

**File**: `supabase/seed.sql`

**Intent**: The current comment says "this project has no custom tables yet, only Supabase Auth's built-in `auth.users` table" — that's now false. Update it to reflect that `flashcards` exists and that seed data is still intentionally omitted (no fixture data needed yet).

**Contract**: Replace the comment text; the file remains functionally empty (no `INSERT` statements).

#### 3. Update stale README.md local-setup claim

**File**: `README.md` (line 114)

**Intent**: The local-setup section states "No database tables or migrations are required — this project uses Supabase Auth's built-in `auth.users` table only." That becomes false once this migration lands, and would mislead anyone following the README's local setup steps.

**Contract**: Replace that sentence with one noting that `flashcards` now exists and that `npx supabase start` (and `db reset`) applies migrations automatically — no extra manual step is required from the reader.

### Success Criteria:

#### Automated Verification:

- Migration file follows naming convention `YYYYMMDDHHmmss_short_description.sql`: `ls supabase/migrations/`
- Migration applies cleanly against a local Supabase instance: `npx supabase start` (if not already running) then `npx supabase db reset`
- Lint passes: `npm run lint`

#### Manual Verification:

- In Supabase Studio's SQL editor (or `psql`), confirm `flashcards` has RLS enabled and exactly 4 policies (`select * from pg_policies where tablename = 'flashcards';`)
- Sign up two test users via the existing signup flow; insert one flashcard per user directly as each user's session; confirm each user's `select * from flashcards` only returns their own row
- Update a row and confirm `updated_at` changes automatically without the update statement setting it explicitly
- Delete one of the two test users from `auth.users` (via Supabase Studio) and confirm their flashcard row is removed (cascade)
- Attempt to insert a flashcard with an empty `question` (or a >2000-char one) and confirm the `CHECK` constraint rejects it

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: TypeScript entity type

### Overview

Give the rest of the codebase (starting with S-02/S-03) a shared, typed representation of a flashcard row.

### Changes Required:

#### 1. Flashcard entity type

**File**: `src/types.ts`

**Intent**: Define the `Flashcard` entity type mirroring the `flashcards` table's row shape, per CLAUDE.md's "Shared types (entities, DTOs) go in `src/types.ts`" convention. This is a new file — no existing types to merge with.

**Contract**: `export interface Flashcard { id: string; user_id: string; question: string; answer: string; created_at: string; updated_at: string; }` — field names and nullability match the migration's column definitions exactly (`created_at`/`updated_at` as ISO strings, per Supabase JS client's default serialization of `timestamptz`).

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes (type-checked ESLint rules): `npm run lint`

#### Manual Verification:

- Field-by-field diff of `Flashcard` against the migration's column list to confirm no drift (no automated schema-to-type sync exists yet, per "What We're NOT Doing")

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None — this slice has no application logic, only a schema and a type declaration. Unit tests belong to the slices that consume this table (S-02, S-03).

### Integration Tests:

- None yet — no API route exists to integration-test. RLS itself is verified manually against Postgres directly (see Phase 1 Manual Verification).

### Manual Testing Steps:

1. Run `npx supabase db reset` and confirm no SQL errors.
2. Follow Phase 1's manual verification steps (RLS isolation, cascade, trigger, constraints) using Supabase Studio.
3. Run `npm run build` and `npm run lint` to confirm the new type compiles cleanly.

## Performance Considerations

The `flashcards_user_id_idx` index keeps per-user lookups (list view in S-03, due-card queries in S-04) from full-table-scanning as row counts grow. No other performance work is in scope — data volume is expected to be small (per `tech-stack.md`'s `target_scale`).

## Migration Notes

This is a net-new table — no existing data to migrate. Future migrations (F-02) will `ALTER TABLE public.flashcards ADD COLUMN ...` to add SRS scheduling columns; this plan does not need to anticipate their shape beyond leaving the table minimal, as the roadmap specifies.

**Downstream obligation for S-02/S-03**: the `question`/`answer` `CHECK` constraints (Phase 1) mean any insert/update path built in S-02 (AI-generated candidates) or S-03 (manual CRUD) can receive a raw Postgres `23514` (`check_violation`) error from Supabase. Those slices' API routes must catch it and map it to CLAUDE.md's `{ error: { code, message } }` response shape — this plan only enforces the constraint at the DB layer, it does not build the catching logic (no API routes exist yet in this slice).

## References

- Roadmap item: `context/foundation/roadmap.md` (F-01: Minimal flashcard data schema)
- Conventions: `CLAUDE.md` (Supabase migrations, RLS, `src/types.ts`)
- Prior lesson (adjacent, not directly applicable here): `context/foundation/lessons.md` — Supabase Auth Site URL, relevant to S-01/S-02 deploys, not this schema-only slice

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Migration — flashcards table, RLS, trigger, index

#### Automated

- [x] 1.1 Migration file follows naming convention — 44674c1
- [x] 1.2 Migration applies cleanly against a local Supabase instance — 44674c1
- [x] 1.3 Lint passes — 44674c1

#### Manual

- [x] 1.4 RLS enabled with exactly 4 policies — 44674c1
- [x] 1.5 Two-user RLS isolation verified — 44674c1
- [x] 1.6 `updated_at` trigger verified — 44674c1
- [x] 1.7 Cascade delete on user removal verified — 44674c1
- [x] 1.8 CHECK constraints reject empty/oversized question or answer — 44674c1

### Phase 2: TypeScript entity type

#### Automated

- [x] 2.1 Build passes
- [x] 2.2 Lint passes

#### Manual

- [x] 2.3 `Flashcard` type field-by-field diff against migration confirmed
