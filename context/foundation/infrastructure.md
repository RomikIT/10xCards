---
project: 10x-cards
researched_at: 2026-09-05
recommended_platform: Cloudflare Workers
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript / JavaScript
  framework: Astro 6 (SSR) + React 19 islands
  runtime: Cloudflare Workers (via @astrojs/cloudflare v13)
---

## Recommendation

**Deploy on Cloudflare Workers.**

Cloudflare Workers is the only researched platform that requires zero migration: `@astrojs/cloudflare@^13.5.0` is already the pinned Astro adapter, `astro.config.mjs` already targets it, `wrangler.jsonc` is already scaffolded, and `wrangler@^4.129.0` is already a devDependency. It scored 5/5 Pass on the agent-friendly criteria, its free tier (100k req/day) comfortably covers the PRD's medium-scale/low-QPS target, and it matches the interview's stated existing familiarity (Q3) and single-region requirement (Q4 — Cloudflare's edge network is a bonus, not a necessity, here). The interview ruled out persistent connections (Q1) and co-located managed services (Q5 — Supabase + OpenRouter stay external), which removes the two factors that would have favored a container-PaaS platform (Fly.io, Railway, Render) instead.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Total |
|---|---|---|---|---|---|---|
| Cloudflare Workers | Pass | Pass | Pass | Pass | Pass | 5 Pass |
| Vercel | Pass | Pass | Pass | Pass | Pass | 5 Pass |
| Netlify | Pass | Pass | Pass | Partial | Pass | 4 Pass / 1 Partial |
| Railway | Pass | Pass | Pass | Pass | Pass | 5 Pass |
| Render | Partial | Pass | Pass | Partial | Pass | 3 Pass / 2 Partial |
| Fly.io | Pass | Partial | Pass | Partial | Pass | 3 Pass / 2 Partial |

**Cloudflare Workers** — `wrangler deploy` / `wrangler rollback` / `wrangler tail` are mature, deterministic, GA commands. Fully serverless (no VM/container to manage). Docs are markdown-native with a published `llms.txt`. Official MCP server plus a newer "Code Mode" MCP server (preview, April 2026). Only caveat: `@astrojs/cloudflare` v13 dropped Cloudflare Pages support entirely — Workers is now the sole deploy target for this Astro version, which this project already assumes.

**Vercel** — Equally strong on all five criteria; `@astrojs/vercel` is a first-party adapter, CLI and MCP are mature (MCP updated to the 2026-07-28 spec with a `deploy_to_vercel` tool). The blocker is commercial: the Hobby tier is explicitly restricted to non-commercial use, so a real product needs Pro ($20/mo). Native WebSocket support only reached public beta in June 2026 (irrelevant here, but a maturity signal). Requires swapping the SSR adapter from `@astrojs/cloudflare` to `@astrojs/vercel`.

**Netlify** — Official `@astrojs/netlify` adapter, GA MCP server, agent-readable docs (`llms.txt`), real-time log tailing (`netlify logs --source functions --follow`, added May 2026). Loses a point because rollback has no dedicated CLI command — it's a re-publish of a prior deploy via the dashboard or a raw `netlify api` call, not a one-liner. Free tier uses a credit-based model with a hard cutoff and no grace period, a real "site goes offline mid-month" risk at unpredictable traffic. Requires an adapter swap.

**Railway** — Also 5/5 Pass: `railway up`/`redeploy`/`logs` are clean, deterministic commands; official remote MCP server; agent-readable docs. No free tier (Hobby $5/mo + usage) and no official Astro adapter — deploys via the generic `@astrojs/node` adapter, which means authoring a `server: { host: "0.0.0.0" }` config and a start command by hand (a documented 502 gotcha if `0.0.0.0` binding is missed). Better fit for a project that needs an always-on container; this one doesn't.

**Render** — Official MCP server and agent-readable docs, but CLI rollback is dashboard-only (no CLI command found), and the free web-service tier spins down after 15 minutes of inactivity — unsuitable for unpredictable SSR traffic. Also requires the generic `@astrojs/node` adapter with the same `0.0.0.0` binding gotcha as Railway.

**Fly.io** — Best-in-class for persistent connections/WebSockets (not needed here). No official Astro adapter — requires authoring and maintaining a Dockerfile, a net-new file this project doesn't currently have. No free tier since 2024 (trial credit only). Rollback is a multi-step process (find a prior release image, redeploy it), not a single command.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Zero-migration fit: already the pinned adapter, already scaffolded (`wrangler.jsonc` exists), already familiar to the developer (interview Q3). 5/5 Pass on the agent-friendly criteria. Free tier (100k req/day) covers the PRD's medium-scale/low-QPS target with margin. Requires `nodejs_compat` for the Supabase SDK — already set in `wrangler.jsonc`.

#### 2. Vercel

Matches Cloudflare on all five criteria and has an equally mature MCP server, but the Hobby tier's non-commercial restriction pushes this project to the $20/mo Pro tier, and it requires swapping the SSR adapter away from the one already configured — a real switching cost with no corresponding capability gain for this stack.

#### 3. Netlify

Strong docs and MCP maturity with a first-party Astro adapter, but the credit-based free tier's hard cutoff (no grace period) and the lack of a one-command CLI rollback are real operational gaps relative to Cloudflare, on top of the same adapter-migration cost as Vercel.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. `nodejs_compat` is mandatory for `@supabase/ssr` / `@supabase/supabase-js` to run in Workers' V8-isolate runtime (not real Node). Any future dependency (a PDF parser, a different LLM SDK) needs individual verification against workerd's compat shim — one incompatible transitive dependency breaks SSR with an opaque runtime error, not a build-time one.
2. There is an open GitHub issue (withastro/astro#14511) about SSR middleware breaking under `nodejs_compat` on compatibility dates ≥2025-09-15, with a documented workaround (`disable_nodejs_process_v2`) — a known rough edge in exactly this stack combination, not a hypothetical risk.
3. Workers bill CPU-time, not requests. The product's core feature — pasting a block of study text for AI-card generation — is exactly the kind of workload (local text handling before the OpenRouter call) that can quietly cross the 10ms/invocation CPU threshold on the free tier and produce errors or overage disconnected from "requests served."
4. Cloudflare Pages is now frozen/maintenance-only, and `@astrojs/cloudflare` v13 dropped Pages support entirely — Workers is the only currently-correct target for this Astro version, which also means there's no simpler fallback tier if the isolate model causes friction later.
5. Supabase's connection pooling (Supavisor/pgbouncer) is tuned for longer-lived server processes; Workers' many short-lived isolates can open bursts of connections that a traditional Node server wouldn't, which is easy to miss at low traffic and only surfaces as connection-limit errors under load.

### Pre-Mortem — How This Could Fail

The team assumed "Cloudflare is already wired up by the starter, so it'll just work," and didn't budget time to exercise the Supabase auth flow under Workers' isolate runtime before the exam deadline. Two weeks in, `@supabase/ssr`'s Node-API dependency surfaced a runtime-only failure in production that never appeared locally — `astro dev`'s Cloudflare runtime emulation doesn't perfectly replicate every Node-compat edge case — costing a full evening chasing `nodejs_compat` flags days before the hard deadline. Separately, the AI-generation route did more local text-chunking than expected before calling OpenRouter, and under CPU-ms billing this pushed large-paste requests over the free tier's per-invocation limit, causing silent 500s on exactly the feature the PRD's success metric (75% AI-card acceptance) depends on. By the time this was caught, the exam date had passed and the motivation to fix it evaporated, leaving a technically-deployed but functionally-broken AI path.

### Unknown Unknowns

- `astro dev`'s Cloudflare runtime emulation doesn't perfectly replicate every Node-compat edge case — "works locally" isn't proof it'll work once deployed.
- Workers bill CPU time, not wall-clock time — network waits (like the OpenRouter call) are cheap, but synchronous text processing before that call counts, and it's easy to get wrong without noticing until an error or a bill appears.
- `astro:env/server` variables must be declared in `astro.config.mjs`'s `env.schema` AND separately provisioned via `wrangler secret put` (or `.dev.vars` locally) — missing the second step doesn't fail the build, it fails silently at runtime with `createClient()` returning `null`.
- `compatibility_date` in `wrangler.jsonc` needs to stay current — Cloudflare made `nodejs_compat` default-on for compatibility dates ≥2026-08-04. This project's `wrangler.jsonc` is currently pinned to `2026-05-08`, so the explicit `nodejs_compat` flag is still load-bearing, not redundant — do not remove it even after bumping the compatibility date past August 2026.
- There is no Cloudflare-native Postgres, so Supabase connection-pooling behavior under a high-concurrency, short-lived-isolate model is a different pattern than what most Supabase docs assume (a long-lived Node server).

## Operational Story

- **Preview deploys**: Cloudflare Workers does not provide automatic PR-preview URLs the way Pages did. The GitHub Actions workflow (`.github/workflows/ci.yml`) currently runs lint + build only; a preview-deploy step (`wrangler versions upload` for a preview version, or a separate `staging` environment in `wrangler.jsonc`) would need to be added if preview URLs become a requirement. Not needed for a solo, after-hours MVP with auto-deploy-on-merge per `tech-stack.md`.
- **Secrets**: `SUPABASE_URL`, `SUPABASE_KEY`, and the OpenRouter API key live as Worker Secrets (`npx wrangler secret put <NAME>`), not in `wrangler.jsonc`'s `vars` block (which is plaintext and committed). Locally, the same names go in `.dev.vars` (already gitignored per CLAUDE.md). CI needs `SUPABASE_URL`/`SUPABASE_KEY` as GitHub Actions repository secrets for the build step (already documented in CLAUDE.md's CI section) plus a `CLOUDFLARE_API_TOKEN` repository secret if/when deploy is added to the CI workflow. Only the account owner can read a Worker Secret's value after it's set (Cloudflare does not expose it back via CLI or dashboard).
- **Rollback**: `npx wrangler rollback [version-id]` reverts to a prior deployed version in seconds; `npx wrangler deployments list` shows available version IDs. Caveat: this project has no database migrations yet (only Supabase Auth's built-in `auth.users` table per README), so there's currently no migration-rollback mismatch to worry about — revisit this note once `supabase/migrations/` gains entries.
- **Approval**: Publishing to production (`wrangler deploy`) is safe for an agent to run unattended for a solo after-hours project with auto-deploy-on-merge (per `tech-stack.md`'s `ci_default_flow`). Human-only actions: rotating the Cloudflare API token, changing account-level billing/plan tier, and deleting the Worker itself.
- **Logs**: `npx wrangler tail` streams live production logs; `npx wrangler tail --format=json` for structured output an agent can parse. Historical logs beyond the live tail window require enabling Cloudflare's Logpush (a paid add-on) — out of scope for MVP.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Supabase SDK hits a Node-API gap in workerd that only appears in production, not local `astro dev` | Pre-mortem | M | H | Deploy to a real Worker early (before feature work is far along) and smoke-test the signup/signin flow against the deployed instance, not just `astro dev` |
| AI-generation route exceeds Workers' free-tier CPU-ms limit on large pasted text, producing errors uncorrelated with request volume | Devil's advocate | M | H | Keep local text pre-processing before the OpenRouter call minimal; if chunking/validation grows heavier, load-test with realistic large pastes and check the Cloudflare dashboard's CPU-time metric before assuming free tier is sufficient |
| `nodejs_compat`-related SSR middleware bug (withastro/astro#14511) surfaces on a future `wrangler`/compatibility-date bump | Devil's advocate | L | M | Pin `compatibility_date` deliberately when bumping it; test the deployed app after any `wrangler` or `@astrojs/cloudflare` upgrade, not just the build |
| Missing or misconfigured secret (`wrangler secret put` step skipped) causes `createClient()` to silently return `null` in production | Unknown unknowns | M | H | After any new env var is added to `astro.config.mjs`'s `env.schema`, immediately run the matching `wrangler secret put` for both production and note it in the PR description |
| Supabase connection-pooling limits get hit under Workers' short-lived-isolate concurrency pattern | Unknown unknowns | L | M | Use Supabase's pooled connection string (Supavisor, transaction mode) rather than a direct connection; monitor Supabase's connection dashboard if traffic grows past MVP scale |
| No automated preview-deploy step exists yet — a bad merge to `master` ships straight to production | Research finding | M | M | Acceptable for a solo after-hours MVP per `tech-stack.md`'s `ci_default_flow: auto-deploy-on-merge`; revisit if a second contributor joins |

## Getting Started

1. Authenticate the CLI (one-time, interactive — not agent-automatable): `npx wrangler login`.
2. Provision the two existing secrets from `.env.example`/`.dev.vars` into the deployed Worker: `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY` (add the OpenRouter API key secret the same way once that integration lands).
3. Build the production bundle: `npm run build` (runs `astro build`, which uses the already-configured `@astrojs/cloudflare` adapter — no separate Cloudflare-specific build step needed).
4. Deploy: `npx wrangler deploy` (reads `wrangler.jsonc`, which is already scaffolded with `compatibility_flags: ["nodejs_compat"]` and the assets binding pointing at `./dist`).
5. Verify: `npx wrangler tail` to confirm the deployed Worker serves requests and logs correctly, then manually exercise the signup/signin flow against the live URL before relying on `astro dev` alone for future changes (see the pre-mortem above).

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup (adding a deploy step to `.github/workflows/ci.yml` is a follow-up, not covered here)
- Production-scale architecture (multi-region, HA, DR)
