---
bootstrapped_at: 2026-09-04T23:08:33Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: 10x-cards
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: 10x-cards
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
```

### Why this stack

10xCards is a solo, after-hours build with a 3-week MVP timeline, medium expected
scale, must-have email+password auth, and an AI-generation flow at its core
(paste study text, get candidate flashcards). This is the recommended default
for (web-app, js): 10x Astro Starter pairs Astro's file-based routing and API
routes with Supabase (Postgres + auth + TypeScript SDK) and Cloudflare edge
deployment, covering the auth requirement out of the box and giving a
TypeScript-first, convention-based surface for the AI-generation API route to
call an LLM against. The short timeline favors a battle-tested, opinionated
starter over assembling auth/database/deploy piecemeal. Bootstrapper
confidence is first-class — expect mostly-smooth scaffolding with occasional
manual steps. Deployment defaults to Cloudflare Pages (the starter's own
default) and CI runs on GitHub Actions with auto-deploy on merge to main,
matching a solo after-hours workflow with no staging-gate need. Payments,
realtime, and background jobs are all out of scope per the PRD's non-goals.

## Pre-scaffold verification

| Signal        | Value                                                  | Severity  | Notes                                                                 |
| ------------- | ------------------------------------------------------- | --------- | ---------------------------------------------------------------------- |
| npm package   | not run                                                | n/a       | `cmd_template` starts with `git clone`, not an npm `create-*` CLI     |
| GitHub repo   | not run                                                | n/a       | `gh` CLI not found on this machine — recency check unavailable       |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 20 top-level entries (`.env.example`, `.github`, `.husky`, `.nvmrc`, `.prettierrc.json`, `.vscode`, `README.md`, `astro.config.mjs`, `components.json`, `eslint.config.js`, `node_modules`, `package-lock.json`, `package.json`, `public`, `src`, `supabase`, `tsconfig.json`, `wrangler.jsonc`, plus `.gitignore` and `CLAUDE.md` handled via the conflict matrix below)
**Conflicts (.scaffold siblings)**: `CLAUDE.md.scaffold` (cwd's existing `CLAUDE.md` — this skill's own instructions file — kept as-is)
**.gitignore handling**: append-merged — cwd's 65 existing lines kept in order, then the scaffold's 9 non-duplicate lines (headers plus `.env.production`, the only pattern not already covered by cwd's set) appended under a `# from 10x-astro-starter` separator
**.bootstrap-scaffold cleanup**: deleted (nested `.git/` removed first, per the git-clone strategy, so the upstream starter's history was not moved into this repo)

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 1 CRITICAL, 14 HIGH, 7 MODERATE, 3 LOW
**Direct vs transitive**: 0/1 CRITICAL, 1/14 HIGH, 2/7 MODERATE, 0/3 LOW direct of total (dependency tree: 449 prod, 316 dev, 131 optional — 895 total)

#### CRITICAL findings

- **tar** `<=7.5.20` (transitive, fix available) — multiple advisories: PAX size-override file smuggling ([GHSA-vmf3-w455-68vh](https://github.com/advisories/GHSA-vmf3-w455-68vh)), PAX numeric path-type confusion crash ([GHSA-w8wr-v893-vjvp](https://github.com/advisories/GHSA-w8wr-v893-vjvp)), decompression/parse DoS ([GHSA-23hp-3jrh-7fpw](https://github.com/advisories/GHSA-23hp-3jrh-7fpw)), negative entry-size infinite loop ([GHSA-8x88-c5mf-7j5w](https://github.com/advisories/GHSA-8x88-c5mf-7j5w)), NUL-byte uncaught exception DoS ([GHSA-gvwx-54wh-qm9j](https://github.com/advisories/GHSA-gvwx-54wh-qm9j)), uncontrolled recursion stack-overflow DoS ([GHSA-r292-9mhp-454m](https://github.com/advisories/GHSA-r292-9mhp-454m))

#### HIGH findings

- **astro** `<=7.0.9` (**direct**, fix available) — six XSS/SSRF advisories, incl. spread-attribute XSS ([GHSA-jrpj-wcv7-9fh9](https://github.com/advisories/GHSA-jrpj-wcv7-9fh9), [GHSA-f48w-9m4c-m7f5](https://github.com/advisories/GHSA-f48w-9m4c-m7f5)), `transition:*` XSS ([GHSA-7pw4-f3q4-r2p2](https://github.com/advisories/GHSA-7pw4-f3q4-r2p2)), view-transition XSS ([GHSA-4g3v-8h47-v7g6](https://github.com/advisories/GHSA-4g3v-8h47-v7g6)), Host-header SSRF ([GHSA-2pvr-wf23-7pc7](https://github.com/advisories/GHSA-2pvr-wf23-7pc7)), slot-name XSS ([GHSA-8hv8-536x-4wqp](https://github.com/advisories/GHSA-8hv8-536x-4wqp))
- **brace-expansion** `<=1.1.17 || 3.0.0-5.0.8` (transitive, fix available) — DoS via exponential/unbounded expansion ([GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp), [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg), [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895))
- **browserslist** `<=4.28.6` (transitive, fix available) — unbounded memory growth ([GHSA-c83g-rgw3-j3cx](https://github.com/advisories/GHSA-c83g-rgw3-j3cx)), crash/prototype write via untrusted stats file ([GHSA-73wf-gq98-2v4g](https://github.com/advisories/GHSA-73wf-gq98-2v4g))
- **devalue** `5.6.3-5.8.0` (transitive, fix available) — DoS via sparse array deserialization ([GHSA-77vg-94rm-hx3p](https://github.com/advisories/GHSA-77vg-94rm-hx3p))
- **fast-uri** `3.0.0-3.1.5` (transitive, fix available) — host-confusion/SSRF family ([GHSA-v2hh-gcrm-f6hx](https://github.com/advisories/GHSA-v2hh-gcrm-f6hx), [GHSA-7p8r-x3mc-p8w7](https://github.com/advisories/GHSA-7p8r-x3mc-p8w7), [GHSA-f65p-4m7j-42xc](https://github.com/advisories/GHSA-f65p-4m7j-42xc), [GHSA-fph4-wmhf-6fwf](https://github.com/advisories/GHSA-fph4-wmhf-6fwf), [GHSA-jqff-g426-hqxp](https://github.com/advisories/GHSA-jqff-g426-hqxp), [GHSA-4c8g-83qw-93j6](https://github.com/advisories/GHSA-4c8g-83qw-93j6))
- **js-yaml** `4.0.0-4.3.0` (transitive, fix available) — quadratic-CPU DoS via merge keys/omap ([GHSA-h67p-54hq-rp68](https://github.com/advisories/GHSA-h67p-54hq-rp68), [GHSA-52cp-r559-cp3m](https://github.com/advisories/GHSA-52cp-r559-cp3m), [GHSA-5p4m-2wfm-xmqj](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj))
- **miniflare** `<=0.0.0-fff677e35 || 3.20250204.0-5.20260801.0-alpha` (transitive, fix available) — advisory chain via nested deps
- **nanoid** `<=3.3.17` (transitive, fix available) — infinite loop on negative/zero size ([GHSA-28wg-ghj8-5hjv](https://github.com/advisories/GHSA-28wg-ghj8-5hjv), [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8))
- **postcss** `<=8.5.22` (transitive, fix available) — arbitrary `.map` file disclosure via sourceMappingURL ([GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp), [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849))
- **sharp** `<0.35.0` (transitive, fix available) — inherited libvips CVEs ([GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj))
- **svgo** `4.0.0-4.0.1` (transitive, fix available) — removeScripts plugin leaves scripts intact ([GHSA-2p49-hgcm-8545](https://github.com/advisories/GHSA-2p49-hgcm-8545))
- **undici** `7.0.0-7.28.0` (transitive, fix available) — TLS bypass, header injection, cache/cookie confusion family (12 advisories, e.g. [GHSA-vmh5-mc38-953g](https://github.com/advisories/GHSA-vmh5-mc38-953g), [GHSA-p88m-4jfj-68fv](https://github.com/advisories/GHSA-p88m-4jfj-68fv))
- **vite** `7.0.0-7.3.3` (transitive, fix available) — NTLMv2 hash disclosure, `server.fs.deny` bypass ([GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3), [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff))
- **ws** `8.0.0-8.20.1` (transitive, fix available) — uninitialized memory disclosure, fragment-flood DoS ([GHSA-58qx-3vcg-4xpx](https://github.com/advisories/GHSA-58qx-3vcg-4xpx), [GHSA-96hv-2xvq-fx4p](https://github.com/advisories/GHSA-96hv-2xvq-fx4p))

#### MODERATE findings

- **@astrojs/language-server** `2.14.0-2.16.10` (transitive, fix available)
- **@cloudflare/vite-plugin** `<=0.0.0-fff677e35 || 0.0.7-1.41.0` (transitive, fix available)
- **supabase** `1.1.6-2.98.2` (**direct**, fix available)
- **volar-service-yaml** `<=0.0.70` (transitive, fix available)
- **wrangler** `<=0.0.0-kickoff-demo || 3.108.0-4.101.0` (**direct**, fix available)
- **yaml** `2.0.0-2.8.2` (transitive, fix available) — stack overflow via deeply nested collections ([GHSA-48c2-rrv3-qjmp](https://github.com/advisories/GHSA-48c2-rrv3-qjmp))
- **yaml-language-server** `1.11.1-08d5f7b.0-1.21.1-f1f5a94.0 || 1.22.1-0ae5603.0-1.22.1-fc5f874.0` (transitive, fix available)

#### LOW / INFO findings

- **@babel/core** `<=7.29.0` (transitive, fix available) — arbitrary file read via sourceMappingURL comment ([GHSA-4x5r-pxfx-6jf8](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8))
- **esbuild** `0.27.3-0.28.0` (transitive, fix available) — arbitrary file read via dev server on Windows ([GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr))
- **postcss-selector-parser** `7.1.0-7.1.2` (transitive, fix available) — DoS via uncontrolled AST recursion ([GHSA-w9m9-85wc-3x92](https://github.com/advisories/GHSA-w9m9-85wc-3x92))

## Hints recorded but not acted on

| Hint                    | Value             |
| ----------------------- | ------------------ |
| bootstrapper_confidence | first-class        |
| quality_override        | false               |
| path_taken              | standard            |
| self_check_answers      | null                |
| team_size               | solo                |
| deployment_target       | cloudflare-pages    |
| ci_provider             | github-actions      |
| ci_default_flow         | auto-deploy-on-merge|
| has_auth                | true                |
| has_payments            | false               |
| has_realtime            | false               |
| has_ai                  | true                |
| has_background_jobs     | false               |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep — `CLAUDE.md.scaffold` here carries the starter's own agent-context notes (commands, auth flow, conventions) that may be worth folding into your existing `CLAUDE.md`.
- Address audit findings per your project's risk tolerance — the full breakdown is above. `npm audit fix` will resolve most `fixAvailable: true` entries; the CRITICAL `tar` finding and the direct HIGH `astro` finding are the highest-value first look.
