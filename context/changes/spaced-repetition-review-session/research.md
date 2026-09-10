---
date: 2026-09-10T00:53:42+02:00
researcher: Claude Sonnet 5
git_commit: 866735627551463857c0801348bc437be9491cbf
branch: master
repository: RomikIT/10xCards
topic: "Is ts-fsrs compatible with the codebase for S-04 (spaced-repetition-review-session)?"
tags: [research, codebase, ts-fsrs, cloudflare-workers, flashcards, s-04, spaced-repetition]
status: complete
last_updated: 2026-09-10
last_updated_by: Claude Sonnet 5
---

# Research: Is `ts-fsrs` compatible with the codebase for S-04?

**Date**: 2026-09-10T00:53:42+02:00
**Researcher**: Claude Sonnet 5
**Git Commit**: 866735627551463857c0801348bc437be9491cbf
**Branch**: master
**Repository**: RomikIT/10xCards

## Research Question

Review the codebase and decide whether `context/changes/spaced-repetition-review-session/ts-fsrs-api-docs.md` is compatible with it, to implement roadmap slice **S-04** (`spaced-repetition-review-session`): "User can review due flashcards via spaced repetition."

## Summary

**`ts-fsrs` is compatible with this codebase and is ready to build on.** All three compatibility dimensions checked out clean:

1. **Runtime (Cloudflare Workers)** — `nodejs_compat` is already enabled in `wrangler.jsonc` and `compatibility_date` (`2026-05-08`) is past the known Astro-SSR/`nodejs_compat` bug threshold. `ts-fsrs`'s only dependencies (`dayjs`, `seedrandom`) are pure JS with no `fs`/`net` usage, so they need nothing beyond what's already configured. `.nvmrc` pins Node `22.14.0`, satisfying `ts-fsrs`'s declared `engines.node >=20.0.0` (a dev/CI-time check only — `workerd` doesn't run Node regardless).
2. **Data schema (F-01)** — the `flashcards` table F-01 introduced is **functionally complete and shipped** (migration `20260909090431_create_flashcards_table.sql`, commit `44674c1`), with exactly the 6 baseline columns (`id`, `user_id`, `question`, `answer`, `created_at`, `updated_at`) and no SRS columns yet — matching the plan's explicit scope boundary. The `Card`→column mapping table in `ts-fsrs-api-docs.md:145-160` applies cleanly as a **new, additive migration** (same naming convention, same per-operation RLS pattern already established).
3. **Service/API conventions** — the doc's suggested API surface (`fsrs()`, `createEmptyCard()`, `scheduler.next()/repeat()`, `TypeConvert.card()`) maps onto the existing flat `*.service.ts` / tagged-union-return / `ServiceError` / `{error:{code,message}}` conventions without friction. One concrete gap: `src/lib/utils.ts` has no `formatDate()` helper yet, which CLAUDE.md already flags as a to-add-when-needed item — S-04's due-date handling is exactly the trigger for adding it.

**Roadmap-status caveat (not a compatibility finding, but material to unblocking S-04):** both of S-04's prerequisites, F-01 and S-02, are marked `in-progress` in `roadmap.md:44,46`, but their own `plan.md` progress logs are 100% checked off with landed commits, and F-01's `change.md` already reads `status: impl_reviewed`. The roadmap table appears stale rather than reflecting actual incomplete work — worth a `/10x-roadmap` status refresh, since it means S-04's only real remaining gate is the library-choice Unknown itself, which this research (plus the pre-existing `srs-library-research.md`) resolves in favor of `ts-fsrs`.

## Detailed Findings

### 1. Cloudflare Workers runtime compatibility

- `wrangler.jsonc:5-6` — `"compatibility_date": "2026-05-08"`, `"compatibility_flags": ["nodejs_compat"]`. The flag is already on for the existing Supabase SDK dependency; `ts-fsrs`'s deps ride along on it for free even though `dayjs`/`seedrandom` don't strictly require it.
- `astro.config.mjs:11,16` — `output: "server"`, `adapter: cloudflare()` — no adapter options that would restrict dependency compatibility.
- `package.json` `dependencies` — no date library or SRS package currently present; nothing conflicts with adding `ts-fsrs`. No `engines` field in `package.json` (Node pinning lives only in `.nvmrc:1` → `22.14.0`, which satisfies `ts-fsrs`'s `engines.node >=20.0.0`).
- `context/foundation/infrastructure.md:60-61,75` — documents that "one incompatible transitive dependency breaks SSR with an opaque runtime error, not a build-time one" and that `nodejs_compat` became default-on for `compatibility_date >= 2026-08-04`; this project's date (`2026-05-08`) predates that but still carries the explicit flag, and is past the separate `withastro/astro#14511` auto-fix threshold (`>= 2025-09-15`) — so no known SSR-middleware bug applies here.
- `context/changes/spaced-repetition-review-session/srs-library-research.md:19,32-34` — a prior external-research pass (exa web search) already reached the same "Cloudflare Workers compatible" conclusion for `ts-fsrs` specifically, citing `dayjs` as confirmed "Works on Workers" on worksonworkers.dev. This internal-research pass corroborates it against the project's actual config rather than general claims.

### 2. `flashcards` schema state (F-01)

- `supabase/migrations/20260909090431_create_flashcards_table.sql` (full contents reviewed) — the only migration in the repo. Columns: `id uuid` PK, `user_id uuid` FK → `auth.users(id) on delete cascade`, `question text not null`, `answer text not null`, `created_at timestamptz`, `updated_at timestamptz`; CHECK constraints on question/answer length (1–2000 chars); `updated_at` trigger; RLS enabled with 4 granular per-operation policies (`select`/`insert`/`update`/`delete`, each scoped `auth.uid() = user_id`). The migration's own header comment explicitly defers SRS columns to a later slice.
- `src/types.ts:1-8` — `Flashcard` interface mirrors the migration exactly (timestamps as ISO strings).
- `src/lib/services/flashcards.service.ts` — CRUD service assumes exactly these 6 columns; no code anywhere in `src/` references a 7th column.
- `context/changes/minimal-flashcard-schema/plan.md` — progress log 100% `[x]`, commits `44674c1` (migration) and `cd9f2f2` (type); `change.md:5` already reads `status: impl_reviewed` despite `roadmap.md:44` still showing `in-progress`.
- **No SRS/scheduling columns exist yet** — this confirms the `ts-fsrs-api-docs.md:145-160` mapping table is describing a genuinely *additive* migration, not a conflicting one. Suggested columns (`due timestamptz`, `stability numeric`, `difficulty numeric`, `state smallint`, `reps integer`, `lapses integer`, `scheduled_days integer`, `learning_steps integer`, `last_review timestamptz nullable`) can follow the same migration-file-naming (`YYYYMMDDHHmmss_short_description.sql`) and per-operation-RLS conventions the existing migration already established — no new RLS policy shape needs to be invented, just extended to the new columns (or left covered by the existing row-level policies, since RLS is row-scoped, not column-scoped).

### 3. S-02/S-03 schema assumptions (both prerequisites for S-04, or parallel to it)

- `context/changes/ai-generated-flashcard-review/plan.md:9,32` — explicitly states no new table/schema; AI candidates live in client-side React state until accepted through the same `flashcards` create endpoint. Progress log 100% `[x]`.
- `context/changes/manual-flashcard-management/plan.md:9-10` — cites the same 6-column `Flashcard` type, no additional columns assumed. Progress log 100% `[x]`.
- Neither slice's shipped code would need to change to accommodate new SRS columns — both only read/write `question`/`answer`.

### 4. Service/API conventions the S-04 implementation should follow

- **Service shape**: flat `*.service.ts` files directly in `src/lib/services/` (`flashcards.service.ts`, `ai-flashcard-generation.service.ts` — no grouped-folder services exist yet, matching CLAUDE.md's rule that the grouped shape is reserved for services that "actually grow into multiple files"). A `review.service.ts` (or similar) wrapping `ts-fsrs` calls (`fsrs()`, `scheduler.next()`) fits this pattern directly.
- **Return shape**: every service function returns a tagged union — `{data}` / `{error: ServiceError}` / `{notFound: true}` — never throws for expected failure cases. `ServiceError` (`src/types.ts:20-23`) is already the shared cross-service error type.
- **API handler shape**: identical skeleton across all `src/pages/api/flashcards/*.ts` routes — `401` auth guard on `context.locals.user`, build `createClient(...)` and `500` if `null`, validate body, delegate to service, map result to status code (`validation_error`→400, `unauthorized`→401, `not_found`→404, `internal_error`→500; `generate.ts` sets a precedent of `generation_failed`→502 for upstream-provider failures specifically — not applicable to `ts-fsrs` since it's in-process compute, not a network call, so failures there would map to `internal_error`/500 like the CRUD routes).
- **DTO naming**: `<Verb><Entity>Command` in `src/types.ts` (`CreateFlashcardCommand`, `UpdateFlashcardCommand`, `GenerateFlashcardsCommand`) — a grading command would follow this as e.g. `GradeReviewCommand`.
- **Routing**: `PROTECTED_ROUTES` in `src/middleware.ts:4` is prefix-matched (`.startsWith()`), currently `["/dashboard", "/flashcards"]`. A review route under `/flashcards/review` would be auto-protected with no middleware change; a route outside that prefix would need a new entry.
- **Missing helper**: `src/lib/utils.ts` currently only exports `cn()` — no `formatDate()` yet, though CLAUDE.md already calls for one "instead of raw `new Date().toISOString()` scattered across files." S-04's due-date comparisons (`Card.due`, `TypeConvert.card()` round-tripping Postgres timestamptz values, per `ts-fsrs-api-docs.md:120-143`) are the natural trigger to add it.
- **No test framework** exists in the repo; both prior slices shipped with manual curl + browser verification checklists instead — S-04's plan should expect to follow the same pattern unless a test framework is introduced as part of this slice.

## Code References

- `wrangler.jsonc:5-6` — `compatibility_date` and `nodejs_compat` flag
- `astro.config.mjs:11,16` — SSR output mode and Cloudflare adapter
- `.nvmrc:1` — pinned Node version (`22.14.0`)
- `supabase/migrations/20260909090431_create_flashcards_table.sql` — the only existing migration; F-01's shipped schema
- `src/types.ts:1-23` — `Flashcard`, `CreateFlashcardCommand`, `UpdateFlashcardCommand`, `ServiceError`
- `src/lib/services/flashcards.service.ts` — CRUD service pattern to mirror for a review/grading service
- `src/lib/services/ai-flashcard-generation.service.ts` — precedent for a service with no DB access and an upstream-failure error code
- `src/pages/api/flashcards/index.ts`, `src/pages/api/flashcards/[id].ts`, `src/pages/api/flashcards/generate.ts` — API handler skeleton to reuse
- `src/lib/utils.ts` — `cn()` only; `formatDate()` not yet added
- `src/middleware.ts:4` — `PROTECTED_ROUTES`
- `context/foundation/infrastructure.md:60-61,75` — Workers `nodejs_compat` risk notes

## Architecture Insights

- The project deliberately keeps each roadmap slice's schema change minimal and additive (F-01's migration comment explicitly defers SRS columns) — S-04 continuing that pattern with one new, purely-additive migration is consistent with how F-01/S-02/S-03 were sequenced.
- Every service in this codebase treats "compute in-process" vs. "call an external provider" as the deciding factor for error-code taxonomy (`internal_error` vs. `generation_failed`/502). Since `ts-fsrs` is a pure in-process library (no network calls), a review-grading service should follow the CRUD services' error mapping, not the AI-generation service's.
- RLS is enforced per-row, not per-column — adding SRS columns to the existing `flashcards` table does not require new RLS policies; the existing 4 per-operation policies already cover the new columns since they gate on `user_id`, not column set.

## Historical Context (from prior changes)

- `context/changes/spaced-repetition-review-session/srs-library-research.md` — prior external research (exa web search) already surveyed 4 candidate libraries and recommended `ts-fsrs` for the same reasons this internal research confirms against actual project config: TypeScript-first, most maintained, Cloudflare Workers compatible, `engines.node` satisfied by `.nvmrc`.
- `context/changes/minimal-flashcard-schema/plan.md` — F-01's contract and 100%-complete progress log; establishes the migration-naming and RLS-policy conventions S-04's schema extension should follow.
- `context/changes/ai-generated-flashcard-review/plan.md` and `context/changes/manual-flashcard-management/plan.md` — both confirm no schema changes of their own and no column assumptions beyond F-01's baseline 6 columns; both establish the API-handler and service-return conventions detailed above.

## Related Research

- `context/changes/spaced-repetition-review-session/ts-fsrs-api-docs.md` — the API reference this research validates against the codebase (context7-fetched `ts-fsrs` docs, install/usage examples, `Card`/`ReviewLog`/`State` shapes, suggested column mapping).
- `context/changes/spaced-repetition-review-session/srs-library-research.md` — external library-comparison research that selected `ts-fsrs` as the recommended candidate.

## Open Questions

- The roadmap (`roadmap.md:44,46,48`) still shows F-01 and S-02 as `in-progress` and S-04 as `blocked`, even though both prerequisites' own plans are fully checked off. This is a bookkeeping gap, not a technical blocker — a `/10x-roadmap` refresh (or manual status edit) would unblock S-04 for `/10x-plan` cleanly. Not addressed by this research since it's out of scope for a compatibility check.
- `ts-fsrs-api-docs.md:162` notes `ReviewLog`/review-history is optional for MVP scope (not required for FR-009/FR-010) — whether S-04's plan includes a review-history table is a scope decision for `/10x-plan`, not something this research resolves.
- Exact API route/page paths for the review session (e.g. `/api/flashcards/review` vs. a dedicated `/api/review/*` namespace, and the corresponding Astro page path) are plan-time decisions; this research only established the precedent pattern to choose from.
