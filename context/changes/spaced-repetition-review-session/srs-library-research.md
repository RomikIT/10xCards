---
change_id: spaced-repetition-review-session
title: Spaced-repetition library options for S-04 / F-02
created: 2026-09-10
source: web_search_exa
---

## Context

F-02 (`srs-library-and-review-schema`) has a blocking Unknown: no ready-made spaced-repetition
library/algorithm is named anywhere in the PRD or `context/foundation/tech-stack.md`. This research
surveys candidate npm libraries and checks compatibility with the project's stack: Astro 6 + React 19,
TypeScript, npm, deployed to **Cloudflare Workers** (workerd runtime).

## Candidates

| Library | Algorithm | Project state | Dependencies | Cloudflare Workers fit |
|---|---|---|---|---|
| **`ts-fsrs`** (open-spaced-repetition org) | FSRS v6 (modern algorithm, now Anki's default) | 769 GitHub stars, MIT, actively maintained (last update 2026-05-22), 114k weekly npm downloads | `dayjs`, `seedrandom` — pure JS, no Node-specific APIs (`fs`, `net`) | Works without `nodejs_compat` flag — `dayjs` is confirmed "Works on Workers" on worksonworkers.dev |
| `@open-spaced-repetition/sm-2` | classic SM-2 | same org as `ts-fsrs`, but explicitly versioned as **unstable** (pre-1.0), low downloads | none documented | should work (pure TS), but immature |
| `supermemo` (VienDinhCom) | SM-2 | very lightweight (2.5KB), zero-dep, but **last published 2020**, 1.8k weekly downloads | none | would work (pure functions), but stale/low-maintenance |
| `@squeakyrobot/fsrs`, `quanta-fsrs` | FSRS v4.5/v6 | very new (Dec 2025 / Apr 2026), very low downloads (2–68/week), zero deps, explicitly claim "Edge Runtime Ready: Cloudflare Workers" | none | compatible per claims, but too new/unproven for a production pick |

## Recommendation

**`ts-fsrs`** — best fit for the stack's stated philosophy (`tech-stack.md`: "battle-tested, opinionated"
over assembling things piecemeal):

- TypeScript-first: full types, ships ESM/CJS/UMD — no friction with Astro/Vite.
- Most popular and most actively maintained option in this space (the `open-spaced-repetition` org
  also maintains FSRS integration used in Anki itself).
- Cloudflare Workers compatible — its only dependencies (`dayjs`, `seedrandom`) are pure JS and do not
  require the `nodejs_compat` flag in `wrangler.jsonc`.
- Declared `engines.node >=20.0.0` is a `package.json` field checked at build/dev time only — it has no
  effect on the workerd runtime itself, and Node 22.14.0 (`.nvmrc`) already satisfies it.
- API (`fsrs()`, `createEmptyCard()`, `Rating`, `scheduler.next()/repeat()`) maps cleanly onto the
  review-state columns F-02 needs to add to `flashcards` (due date, stability, difficulty, reps, lapses).

Install: `npm install ts-fsrs`

**Fallback alternative:** `supermemo` (classic SM-2) — simpler algorithm, smaller mental model, but
unmaintained since 2020 and a worse match for the roadmap's explicit preference for a proven, ready-made
library.

## Open follow-up

This research resolves F-02's blocking Unknown (library choice) but does not itself land the schema
change — that's F-02's own scope (`srs-library-and-review-schema`), which should record the final
decision and design the `flashcards` review-state columns against `ts-fsrs`'s `Card` shape.
