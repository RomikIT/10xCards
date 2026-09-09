---
project: "10xCards"
version: 1
status: draft
created: 2026-09-08
updated: 2026-09-10
prd_version: 1
main_goal: speed
top_blocker: capacity
milestone_id: mvp-ai-flashcard-loop
milestone_seq: 1
milestone_status: open
---

# Roadmap: 10xCards

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: MVP AI Flashcard Loop** — Status: open

- **Intent:** Ship the end-to-end MVP loop — sign up/log in, generate flashcards from pasted study text via AI and review the candidates, manage flashcards manually, and study due cards via spaced repetition — so the product can actually demonstrate that AI-assisted card creation removes the manual-authoring bottleneck it was built to solve.
- **Source materials:** `context/foundation/prd.md` (v1)
- **Done when:** every F-NN and S-NN below is `done`.
- **Scope anchors:** FR-001–FR-010, US-01

## Vision recap

Professionals preparing for a certification exam want to use spaced repetition to retain study material, but manually authoring flashcards from notes and guides is slow and tedious — this friction keeps them from a proven learning method. Existing tools solve only half the problem (a real spaced-repetition engine paired with heavy manual card creation, or easy card creation without a real algorithm); 10xCards pairs a real spaced-repetition engine with AI-assisted card generation from pasted text to close that gap.

## North star

**S-04: User can review due flashcards via spaced repetition** — the spaced-repetition engine is the other half of the product's value proposition (per the Vision recap: "a real spaced-repetition engine paired with AI-assisted card generation"), so proving the full review-and-grade loop actually works end-to-end is the validation this roadmap now treats as most load-bearing.

> North star, here, means the smallest end-to-end slice whose successful delivery would prove the product's value actually works — placed as early as its Prerequisites allow, because every other slice matters less if this one fails. This gloss applies for the rest of the document; the term isn't re-defined below.

## At a glance

| ID   | Change ID                        | Outcome (user can …)                                                              | Prerequisites | PRD refs                                | Status   |
| ---- | --------------------------------- | ----------------------------------------------------------------------------------- | -------------- | ----------------------------------------- | -------- |
| F-01 | minimal-flashcard-schema          | (foundation) minimal `flashcards` table with per-user RLS exists                    | —              | Access Control                            | in-progress |
| S-01 | account-signup-and-login          | user can sign up and log in                                                         | —              | FR-001, FR-002                            | in-progress |
| S-02 | ai-generated-flashcard-review     | user can paste study text, get AI flashcard candidates, and accept/edit/reject them | F-01, S-01     | FR-003, FR-004, US-01                     | in-progress |
| S-03 | manual-flashcard-management       | user can create, view, edit, and delete flashcards manually                         | F-01, S-01     | FR-005, FR-006, FR-007, FR-008            | in-progress |
| S-04 | spaced-repetition-review-session  | user can review due flashcards and grade recall via a spaced-repetition algorithm   | F-01, S-02     | FR-009, FR-010                            | blocked  |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                     | Chain                    | Note                                                                                                             |
| ------ | -------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| A      | AI-generation core loop    | `F-01` → `S-02`           | First vertical slice the "speed" goal prioritizes; feeds Stream D, which now carries the north star.             |
| B      | Manual fallback            | `S-03`                    | Off `F-01` (Stream A); runs parallel to `S-02`, no new external-integration risk.                                |
| C      | Access                     | `S-01`                    | Already satisfied by baseline; independent of the data foundation.                                               |
| D      | Spaced-repetition readiness | `S-04`                    | Carries the north star (`S-04`); joins Stream A at `S-02` (needs real flashcards from the AI-generation loop) and depends directly on `F-01` for its review-state columns; blocked until the spaced-repetition library is chosen. |

## Baseline

What's already in place in the codebase as of `2026-09-08` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6 + React 19 islands, file-based routing, shadcn/ui installed and used (`astro.config.mjs`, `components.json`, `src/components/ui/button.tsx`).
- **Backend / API:** partial — only auth endpoints exist (`src/pages/api/auth/{signin,signup,signout}.ts`); no domain (flashcard) API routes yet. Each slice below adds its own routes as needed — no separate backend-scaffolding Foundation required.
- **Data:** absent — no migrations, no application tables beyond Supabase's built-in `auth.users` (`supabase/seed.sql` confirms this explicitly).
- **Auth:** present — Supabase Auth wired via `src/lib/supabase.ts`, `src/middleware.ts` enforces route protection, working signin/signup/signout endpoints and pages.
- **Deploy / infra:** present — Cloudflare Workers (`wrangler.jsonc`), GitHub Actions CI with lint+build and auto-deploy on merge to `master`.
- **Observability:** absent — no logging library, error tracking, or metrics beyond what the platform provides by default.

## Foundations

### F-01: Minimal flashcard data schema

- **Outcome:** (foundation) A minimal `flashcards` table (question, answer, owner `user_id`, timestamps) exists with per-user row-level-security policies, so every other slice has somewhere to persist and query flashcards scoped to their owner.
- **Change ID:** minimal-flashcard-schema
- **PRD refs:** Access Control, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008
- **Unlocks:** S-02, S-03, S-04
- **Prerequisites:** —
- **Parallel with:** S-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The codebase currently has no application tables at all — everything downstream is blocked until this lands, so it's sequenced first. Kept intentionally minimal (no spaced-repetition scheduling columns, no separate deck/tag entities) so it doesn't drift into "build the whole data layer" — S-04 extends the table with its own scheduling columns once the spaced-repetition library is chosen.
- **Status:** in-progress

## Slices

### S-01: User can sign up and log in

- **Outcome:** user can sign up for an account and log in with email + password
- **Change ID:** account-signup-and-login
- **PRD refs:** FR-001, FR-002
- **Prerequisites:** —
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Already fully implemented per the auto-researched baseline (working signup/signin/signout endpoints and pages, middleware-enforced route protection on `/dashboard`). This slice exists to close PRD-refs coverage and to re-verify the signup → confirm-email → login path end-to-end against the deployed instance, per the recorded lesson that Supabase's default Auth Site URL isn't updated automatically on deploy.
- **Status:** in-progress

### S-02: User converts pasted study text into AI-generated, reviewable flashcards

- **Outcome:** user can paste a block of study text, request AI-generated flashcard candidates, and accept, edit, or reject each one before it's saved to their deck
- **Change ID:** ai-generated-flashcard-review
- **PRD refs:** FR-003, FR-004, US-01
- **Prerequisites:** F-01, S-01
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:**
  - Which prompt/extraction approach actually yields flashcards good enough to hit the 75% acceptance target — needs at least one round of testing against real pasted study text. Owner: user. Block: no.
  - The OpenRouter API key must be provisioned as a Worker secret (`wrangler secret put`) before this reaches production — easy to skip silently, per `infrastructure.md`'s risk register. Owner: user. Block: no.
- **Risk:** The only slice with a new external AI-provider integration, and the one the PRD's primary success metrics measure directly. Sequenced immediately after the data foundation because the "speed" goal means core value comes before polish, not after — and because it's the prerequisite that unlocks the north star, S-04.
- **Status:** in-progress

### S-03: User can manually create, view, edit, and delete flashcards

- **Outcome:** user can fully manage their own flashcards (create, view, edit, delete) without going through AI generation
- **Change ID:** manual-flashcard-management
- **PRD refs:** FR-005, FR-006, FR-007, FR-008
- **Prerequisites:** F-01, S-01
- **Parallel with:** S-02, S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Standard CRUD on the table F-01 creates; no new external-integration risk. Kept as one slice rather than split by CRUD verb, since create/view/edit/delete of the same entity are the minimum viable "manage my own flashcards" capability together. Runs in parallel with S-02 to make efficient use of limited solo, after-hours development time.
- **Status:** in-progress

### S-04: User can review due flashcards via spaced repetition

- **Outcome:** user can start a review session where due flashcards — scheduled by a chosen spaced-repetition algorithm — are served, and grade their recall to update the schedule. Landing this includes picking a ready-made spaced-repetition library and adding its review-state columns (e.g. due date, ease factor, interval) to the `flashcards` table.
- **Change ID:** spaced-repetition-review-session
- **PRD refs:** FR-009, FR-010
- **Prerequisites:** F-01, S-02
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:**
  - No specific ready-made spaced-repetition library or algorithm is named anywhere in the PRD or `tech-stack.md` — Non-Goals rules out building one from scratch, but the actual choice is still open, and this slice's review-state schema depends on it before the review-session logic can be built. Owner: user. Block: yes.
- **Risk:** This is the north star — the spaced-repetition loop is the product's other core differentiator per the Vision recap, so proving it end-to-end validates the second half of the product's value proposition. It needs real flashcards to review, so it depends on S-02, and needs the `flashcards` table from F-01 to extend with scheduling columns. The library choice and its schema were previously split into a separate F-02 foundation, but since the schema only makes sense once the library is picked and nothing else consumed that foundation, it's folded directly into this slice — one less layer to track for the same blocking decision.
- **Status:** blocked

## Backlog Handoff

| Roadmap ID | Change ID                        | Suggested issue title                                         | Ready for `/10x-plan` | Notes                                       |
| ---------- | --------------------------------- | ----------------------------------------------------------------- | ---------------------- | ---------------------------------------------- |
| F-01       | minimal-flashcard-schema          | Add minimal flashcards table with per-user RLS                    | yes                     | Run `/10x-plan minimal-flashcard-schema`       |
| S-01       | account-signup-and-login          | Verify signup/login flow end-to-end in production                 | yes                     | Run `/10x-plan account-signup-and-login`       |
| S-02       | ai-generated-flashcard-review     | AI-generated flashcard candidates with accept/edit/reject review  | no                      | Blocked on F-01                                |
| S-03       | manual-flashcard-management       | Manual flashcard CRUD                                              | no                      | Blocked on F-01                                |
| S-04       | spaced-repetition-review-session  | Pick spaced-repetition library, land review-state schema, and ship the review session | no      | Blocked on choosing a spaced-repetition library; also needs F-01 and S-02 |

## Open Roadmap Questions

1. **Hard deadline (2026-09-14) is shorter than the committed 3-week MVP estimate.** Owner: user. Block: no — informational only; the PRD already resolved this as an aspirational personal-exam date, not a hard ship gate for the software.

## Parked

- **No custom spaced-repetition algorithm.** Why parked: PRD Non-Goals — building a competitive scheduling algorithm isn't the product's value proposition, so this milestone integrates a ready-made one instead (see S-04's blocking Unknown for the library choice).
- **No import of non-text formats (PDF, DOCX, etc.).** Why parked: PRD Non-Goals — input is copy-pasted text only for the MVP.
- **No sharing or collaboration between users.** Why parked: PRD Non-Goals — flashcards are single-tenant and single-owner.
- **No mobile app or third-party platform integrations.** Why parked: PRD Non-Goals — web only for the MVP.
- **Observability (structured logging, error tracking, metrics).** Why parked: baseline reports it absent and no PRD NFR requires it; with `main_goal: speed` and `top_blocker: capacity`, it stays out of this milestone's scope — revisit if production incidents make it necessary.

## Milestone History

(Empty — this is the first milestone.)

## Done

(Empty — no changes archived yet.)
