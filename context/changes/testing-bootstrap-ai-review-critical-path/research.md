---
date: 2026-09-10T17:31:13+02:00
researcher: Piotr Romik
git_commit: bb9b3e786576a7531b24acb6aef6767d4db07284
branch: master
repository: 10xCards
topic: "Rollout Phase 1 (test-plan.md §3) — grounding Risk #1 and Risk #2"
tags: [research, codebase, testing, ai-flashcard-generation, flashcards-api, openrouter]
status: complete
last_updated: 2026-09-10
last_updated_by: Piotr Romik
---

# Research: Rollout Phase 1 — AI review critical path (Risk #1, Risk #2)

**Date**: 2026-09-10T17:31:13+02:00
**Researcher**: Piotr Romik
**Git Commit**: bb9b3e786576a7531b24acb6aef6767d4db07284
**Branch**: master
**Repository**: 10xCards

## Research Question

Ground rollout Phase 1 of `context/foundation/test-plan.md` (Risk #1 — candidate accept/edit/reject persistence mismatch; Risk #2 — OpenRouter unavailable/invalid-key/malformed-data handling). For each risk: locate the real failure path in code, verify or correct the Risk Response Guidance from `test-plan.md` §2, locate existing tests, identify the cheapest useful test layer, and flag speculative risks or misleading hot-spot evidence.

## Summary

- **No test infrastructure exists at all** — no Vitest/Jest config, no `test` script in `package.json`, zero `*.test.ts(x)` files anywhere. Phase 1's "bootstrap the runner" goal is confirmed necessary from a clean slate.
- **Risk #1 is a mix of "already handled" and "one real gap".** Accept sends exactly what's on screen (edited or not) — no stale-closure bug. Reject never calls the network. List removal is *not* optimistic — it only happens after a confirmed 2xx response. The one genuine, unmitigated gap is **no server-side duplicate-save protection**: the Accept button's `isSubmitting`/`disabled` guard is client-side only, and `POST /api/flashcards` has no unique constraint or idempotency key, so two identical inserts can land as two rows.
- **Risk #2's error taxonomy is thinner than the test-plan implies.** There is no distinct `config_error` or "invalid key" code — missing key, invalid key (401/403 from OpenRouter), network failure, timeout, and malformed response all collapse into one generic `generation_failed` (502) error. A hard 20s server-side timeout already exists (`AbortSignal.timeout`), so a true infinite hang is not reproducible from current code — testing should target the generic-error path and the UX ceiling of 20s, not a nonexistent taxonomy split. The "no extractable facts" vs "parse failure" distinction the risk worried about *does* already exist structurally: an empty-but-valid `candidates: []` returns 200, any parse/shape failure returns 502 — but this is implicit in control flow, not an explicit code path, and is worth a regression test to lock in.
- There is **no separate `src/lib/openrouter.ts` client module** — the test-plan's Stack note referencing one is slightly inaccurate. The entire OpenRouter HTTP call, JSON-schema constraint, and hand-rolled parsing/validation live inline in `src/lib/services/ai-flashcard-generation.service.ts`. Mocking should target this file's `fetch` boundary directly.
- The config-status banner (`src/lib/config-status.ts`) is unrelated to the generate-flashcards runtime error path — it's a static, page-load-time check of env-var *presence*, not key *validity*. No interaction exists between the banner and the `generation_failed` error; the test-plan's phrase "interaction with the config-status banner" should be read narrowly (they are two independent signals, not integrated).

## Detailed Findings

### Risk #1 — Candidate accept/edit/reject persistence mismatch

**Component**: `src/components/flashcards/CandidateCard.tsx` (full file read, 147 lines).

1. **Accept flow.** `handleAccept` (`CandidateCard.tsx:51-71`) builds the request body directly from the component's own `question`/`answer` state: `const command: CreateFlashcardCommand = { question: question.trim(), answer: answer.trim() }` (`CandidateCard.tsx:56`), POSTed to `/api/flashcards` (`:57-61`). These are the *same* state variables bound to both the edit-mode `<Textarea>` (`:81-93`) and the view-mode display (`:98-99`), initialized once from `candidate.question`/`candidate.answer` (`:30-31`). Whatever is on screen is exactly what's sent — **no stale-original-text bug exists**.
2. **Edit-then-accept.** No separate "original" variable is submitted. The only way to revert to AI-original text is the explicit `cancelEditing()` handler (`:44-49`), which intentionally resets state back to `candidate.question`/`candidate.answer` — expected behavior, not a defect.
3. **Reject flow.** `handleReject` (`:73-75`) calls only `onRejected()` — **no network call at all**. In the parent, `onRejected` maps to `removeCandidate(candidate.id)`, a pure local state filter (`src/components/flashcards/GenerateFlashcards.tsx:109-111, 63-65`). A rejected candidate cannot be persisted through this path because no request is ever sent.
4. **Double-click / duplicate-save protection.** `isSubmitting` is set synchronously at the top of `handleAccept`, before the `fetch` call, and the Accept button is `disabled={!canAccept}` where `canAccept = questionValid && answerValid && !isSubmitting` (`:37, 109`). This is a **client-side-only guard**: no idempotency key is sent, and the server (see below) has no dedup logic. A genuine double-click within one render is blocked, but this is not an airtight guarantee against retries, replayed requests, or a bypassed client.
5. **List-removal timing.** `onAccepted()` (which triggers removal from the candidate list) fires only after `if (!response.ok) throw ...` is passed, i.e. only on a confirmed 2xx (`:62-65`). On failure, the `catch` block sets an error message and the card stays in the list (`:66-70`). **This is not optimistic UI** — the test-plan's "client-side list removal isn't proof of a server save" framing does not describe a live bug in this code; it's already correctly gated.
6. **Persistence endpoint** — `src/pages/api/flashcards/index.ts` `POST` handler (lines 29-73, read in full): requires `context.locals.user` (401 `unauthorized` if absent, `:30-32`); parses JSON (400 `validation_error` on failure, `:42-47`); validates `question`/`answer` are non-empty strings ≤2000 chars trimmed (400 `validation_error`, `:48-60`); calls `createFlashcard(supabase, userId, {...})` → `src/lib/services/flashcards.service.ts:27-43`, a plain `supabase.from("flashcards").insert({...}).select().single()` — **no `upsert`, no `onConflict`, no unique constraint**. The migration `supabase/migrations/20260909090431_create_flashcards_table.sql` (lines 5-14 for the CHECK constraints, 45-68 for RLS) confirms: only length CHECK constraints and per-user RLS policies exist, nothing preventing two identical `(user_id, question, answer)` rows.
7. **Existing tests**: zero. No `*.test.ts(x)` files exist anywhere in the repo (confirmed by repo-wide search); `package.json` has no `test` script.

**Verdict on Risk #1 response guidance (test-plan.md §2, row #1)**: partially correct, partially already mitigated.
- "Accepting saves exactly what was shown" — **confirmed true**, worth a regression test.
- "Editing before accepting saves the edit, not the original" — **confirmed true**, worth a regression test (guards against future refactors reintroducing a stale-state bug).
- "Rejecting never triggers a network call" — **confirmed true** as stated.
- "A double-click doesn't produce a duplicate save" — **this is the one real, currently-unmitigated gap.** No server-side idempotency/uniqueness exists; only a soft client-side disable. This should be the priority assertion for Phase 1, and is also worth flagging to the user as a possible follow-up product fix (unique constraint or dedupe key), separate from the test itself.
- The "must challenge" framing ("client-side removal isn't proof of a correct server save") is a good regression-guard test to write, but is **not evidence of a live bug** — the code already only removes on confirmed success.

### Risk #2 — OpenRouter unavailable / invalid key / malformed data

**Service**: `src/lib/services/ai-flashcard-generation.service.ts` (full file read). **Route**: `src/pages/api/flashcards/generate.ts` (51 lines, read in full, reproduced above). **Client**: `src/components/flashcards/GenerateFlashcards.tsx`.

1. **HTTP boundary.** Raw `fetch` (no SDK, no separate client module) to `https://openrouter.ai/api/v1/chat/completions` (`ai-flashcard-generation.service.ts:4`), called at `:70-85`. Request includes `model: "openai/gpt-4o-mini"` (`:7`), a system+user message pair, and `response_format: RESPONSE_JSON_SCHEMA` enforcing `{candidates: [{question, answer}]}` shape (`:24-50, 76-83`). A hard **20-second timeout** is enforced via `signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)` (`REQUEST_TIMEOUT_MS = 20000` at `:10`, used at `:84`). **A true infinite hang is not reproducible server-side** given this code.
2. **Unavailability / network error.** The `fetch` is inside a try/catch (`:69-89`); any thrown error (network failure, DNS, or the timeout abort) is caught, logged, and returns `{ error: GENERATION_FAILED_ERROR }` (`:88`), a fixed constant `{ code: "generation_failed", message: "We couldn't generate flashcards right now. Please try again." }` defined at `:12-15`. The route maps this to **HTTP 502** with the same error body (`generate.ts:46-48`) — a deliberate, actionable response, not an unhandled 500.
3. **Invalid API key.** Checked via `!response.ok` after the fetch (`:91-98`) — this covers OpenRouter's 401/403 for an invalid/revoked key. However, it is **not distinguished from any other non-2xx status** — it collapses to the same generic `generation_failed`/502. A *missing* key (env var unset) is checked separately, *before* any HTTP call (`:63-66`), but also returns the same generic error with no distinct code. **The test-plan's implication of a separate "invalid key error" branch does not exist in code** — invalid key, missing key, and generic network failure are indistinguishable to the client.
4. **Malformed / invalid response data.** Sequential, independently-caught checks — envelope JSON parse failure (`:100-106`), missing/wrong-type `choices[0].message.content` (`:108-112`), inner-JSON parse failure (`:114-120`), non-array `candidates` (`:122-125`) — all collapse to the same `GENERATION_FAILED_ERROR`. No schema-validation library (zod, etc.) is used; validation is hand-rolled via `isValidCandidate` (`:135-148`), applied per-element via `.filter(isValidCandidate)` (`:129`) *after* the `Array.isArray` check passes. A legitimately empty AI result (`candidates: []`) is **not an error** — it passes through to `{ data: [] }` (`:132`) and the route returns **200** with `{ candidates: [] }` (`generate.ts:50`). So "no extractable facts" (200, empty array) *is* structurally distinguishable from "response failed to parse" (502, generic error) — the test-plan's worry is already addressed by the type/control-flow split, though it's implicit rather than an explicit named code. Per-candidate malformed entries within an otherwise-valid array are silently dropped with no error or distinct log — a real, separate gap worth a test case, but out of the stated Risk #2 scope (it's a data-quality nuance, not an outage/error-surfacing failure).
5. **Error-code taxonomy** (generate route, 3 distinct codes total): `unauthorized` (401, no session), `validation_error` (400, bad/oversized/undersized input), `generation_failed` (502, catch-all for every OpenRouter-side failure: missing key, invalid key, network error, timeout, malformed envelope, malformed inner JSON, non-array candidates). **This is thinner than the test-plan's "generation_failed vs validation_error taxonomy" framing suggests** — there is no `config_error` or equivalent; everything OpenRouter-side is one bucket.
6. **Client-side handling.** `GenerateFlashcards.tsx`: on `!response.ok`, throws `new Error(await extractErrorMessage(response))` which reads `body.error.message` (falls back to a generic string on parse failure) — displayed via `<ServerError message={error} />` (a styled alert box, `src/components/auth/ServerError.tsx:9-15`). `isGenerating` is always cleared in a `finally` block regardless of outcome, so the "Generating..." button label cannot hang indefinitely as long as the client `fetch` itself resolves or rejects — bounded in practice by the server's 20s timeout. No separate client-side timeout/AbortSignal exists; if the Cloudflare edge function were killed without writing a response, this is not explicitly handled, but that is a platform-level edge case, not the "no timeout at all" scenario the risk originally evoked.
7. **Config-status banner.** `src/lib/config-status.ts:19-25` checks `Boolean(OPENROUTER_API_KEY)` at page-load time and renders a static banner (`src/layouts/Layout.astro:22-37`) when the key is *absent*. It has **no runtime relationship** to the generate-flashcards error path — an invalid-but-present key produces no banner, only the generic `generation_failed` error after the user clicks Generate. The test-plan's "interaction with the config-status banner" phrase should be scoped to: these are two independent, non-interacting signals.
8. **Existing tests**: zero, same as Risk #1.

**Verdict on Risk #2 response guidance (test-plan.md §2, row #2)**: mostly correct in intent, one factual correction needed.
- "User sees a clear message, not a hang, not a raw 500" — **confirmed true and already achieved** (502 + generic actionable message, 20s hard ceiling). Good regression-test target: assert the 502 + message shape for each of the underlying failure modes, and that `isGenerating`/the spinner always resolves.
- "Invalid-key error" as if distinct from other failures — **factually incorrect as implemented**; there is one undifferentiated `generation_failed` code. The plan/tests should assert the *actual* current behavior (all these inputs → generic 502) rather than a taxonomy split that doesn't exist. If a distinct code is desired, that's a product change, not a test target.
- "no extractable facts" vs "parse failure" distinguishability — **confirmed true**, but via the 200-empty-array vs 502-error split, not a named error code. Worth a regression test asserting exactly this split.
- Mocking guidance: mock `global.fetch` (or the module boundary of `ai-flashcard-generation.service.ts`), **not** a `src/lib/openrouter.ts` client — that file doesn't exist.

## Code References

- `src/components/flashcards/CandidateCard.tsx:51-75` — accept/edit/reject handlers (Risk #1 core)
- `src/components/flashcards/CandidateCard.tsx:30-31, 44-49` — state initialization and cancel-editing reset
- `src/components/flashcards/CandidateCard.tsx:37, 109, 54, 68-70` — client-side duplicate-submit guard (`isSubmitting`/`canAccept`)
- `src/components/flashcards/GenerateFlashcards.tsx:63-65, 109-111` — `removeCandidate` / `onRejected` wiring
- `src/pages/api/flashcards/index.ts:29-73` — `POST /api/flashcards` persistence endpoint (auth, validation, no dedup)
- `src/lib/services/flashcards.service.ts:27-43` — `createFlashcard` (plain insert, no upsert/unique constraint)
- `supabase/migrations/20260909090431_create_flashcards_table.sql:5-14, 45-68` — CHECK constraints and RLS, confirms no uniqueness constraint
- `src/lib/services/ai-flashcard-generation.service.ts:4, 7, 10, 12-15, 63-98, 100-132, 135-148` — OpenRouter HTTP call, timeout, error constant, response validation, per-candidate filter
- `src/pages/api/flashcards/generate.ts:8-51` — generate route, full error taxonomy (`unauthorized`/`validation_error`/`generation_failed`)
- `src/components/flashcards/GenerateFlashcards.tsx:15-22, 50-60` — client error extraction and `finally`-guaranteed loading-state reset
- `src/components/auth/ServerError.tsx:9-15` — shared error-banner component
- `src/lib/config-status.ts:19-25` — OpenRouter config-presence check (unrelated to runtime errors)
- `src/layouts/Layout.astro:22-37` — global config-status banner rendering
- `astro.config.mjs:17-23` — `env.schema` declaring `SUPABASE_URL`, `SUPABASE_KEY`, `OPENROUTER_API_KEY`; no `getViteConfig()` wired yet
- `package.json:5-14` — no `test` script; no testing dependencies present anywhere in the manifest

## Architecture Insights

- The AI-generation flow has **no server-side persistence of candidates before Accept** — candidates live only in client React state (`GenerateFlashcards.tsx`) until an individual Accept POST. This means Risk #1's blast radius is per-candidate, not batch.
- Error handling across both the flashcards CRUD and the generate route follows a consistent `{ error: { code, message } }` shape (per `CLAUDE.md`'s API convention) with route-level `Response.json(..., { status })` — no shared error-mapping helper beyond what's inlined per route.
- The OpenRouter integration is monolithic (HTTP call + schema + parsing + validation all in one service file) rather than split into a client + parser — future tests should mock at the `fetch` boundary of that one file.
- No `getViteConfig()` in `astro.config.mjs` yet — Vitest setup (Phase 1's bootstrap goal) will need to either import it from `astro/config` or otherwise handle `astro:env/server`'s virtual module resolution, since both `flashcards.service.ts`'s Supabase client and the OpenRouter service likely resolve secrets through that env schema.

## Historical Context (from prior changes)

- `context/archive/2026-09-09-ai-generated-flashcard-review/plan.md` — the AI-generation/candidate-review flow was built in two phases (backend service + route, then frontend components), fully shipped. Explicitly noted as **out of scope at build time**: no candidate persistence before accept, no bulk-save endpoint, no automatic retry, no test framework/automated tests (manual verification only). Confirms per-candidate silent-filtering and the single `generation_failed` error code were deliberate, not oversights.
- `context/archive/2026-09-09-manual-flashcard-management/plan.md` — built the shared `flashcards.service.ts` and `POST /api/flashcards` contract that the candidate-review Accept flow reuses unchanged. Notes that RLS returns an *empty result array* (not a Postgres error) for rows the caller doesn't own on UPDATE/DELETE, requiring explicit not-found mapping in the service layer — relevant background for Risk #3/#4 (a later rollout phase), not directly for Phase 1's POST-only path. No duplicate-detection logic is mentioned anywhere in this plan either, corroborating the Risk #1 gap found above.
- Neither archived folder contains a `research.md` — the `plan.md` files are the only historical record; this document is the first `research.md`-level ground-truth check against current source for this area.

## Related Research

- None yet — this is the first `research.md` for the `testing-*` rollout phases opened from `context/foundation/test-plan.md`.

## Open Questions

- None blocking Phase 1. For a later rollout phase (not in scope here): should `POST /api/flashcards` gain a server-side uniqueness/idempotency mechanism, given Risk #1's confirmed duplicate-save gap? That's a product/implementation decision, not a research gap — flagging for `/10x-plan` to decide whether Phase 1's test should merely *document* current (unprotected) behavior or whether a fix should be proposed alongside the test.
