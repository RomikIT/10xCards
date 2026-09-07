# Cloudflare Workers Integration & Deployment Plan

## Context

`context/foundation/infrastructure.md` recommends deploying 10xCards to **Cloudflare Workers** (not Pages — `@astrojs/cloudflare` v13 dropped Pages support entirely, so Workers is the only valid target for this Astro version). The adapter, `wrangler.jsonc`, and `astro.config.mjs` are already scaffolded for it, but the project has never actually been deployed: there's no `.dev.vars`, no secrets provisioned on the live Worker, no `deploy` script, and CI (`.github/workflows/ci.yml`) only lints and builds — it has no deploy step. This plan turns infrastructure.md's "Getting Started" list and Operational Story into an executable, checkbox-tracked rollout, folds in the Risk Register's mitigations as concrete steps (not just table rows), and adds extra support steps for the edge cases infrastructure.md's anti-bias cross-check flagged (env var schema pitfalls, `nodejs_compat` SSR bug, Supabase connection pooling).

Two decisions confirmed with the user:
- CI will **auto-deploy on merge to `master`** (matches `tech-stack.md`'s `ci_default_flow: auto-deploy-on-merge` and infrastructure.md's Operational Story, which says unattended `wrangler deploy` is acceptable for this solo, no-staging-gate MVP).
- `context/foundation/tech-stack.md`'s stale `deployment_target: cloudflare-pages` frontmatter field will be corrected to `cloudflare-workers` as part of this work (a factual sync, not a re-litigated platform decision — infrastructure.md already made that call).

**Verified during research** (not just infrastructure.md's claim): `withastro/astro#14511` (the `nodejs_compat` SSR-middleware bug) is **closed upstream**. Root cause was Astro's Node-detection racing Cloudflare's `process` v2 polyfill for `compatibility_date >= 2025-09-15`. Cloudflare auto-enables a fix (`fetch_iterable_type_support`) for `compatibility_date >= 2026-02-19`. This project's `wrangler.jsonc` already pins `compatibility_date: "2026-05-08"` (past the auto-fix threshold) with `wrangler ^4.129.0` (past the fixed version) — so this bug should **not** reproduce here, but Phase 5 still smoke-tests it explicitly since "should not reproduce" isn't "verified."

---

## Phase 0 — Fix doc drift

- [x] Edit `context/foundation/tech-stack.md` frontmatter: `deployment_target: cloudflare-pages` → `deployment_target: cloudflare-workers`.

## Phase 1 — One-time manual account setup (human-only, not agent-automatable)

Per CLAUDE.md's production-access boundary: tokens are scoped, not master keys, and live in env vars / CI secrets, never committed.

- [x] Authenticate the local CLI: `npx wrangler login` (interactive OAuth flow — cannot be scripted).
- [x] Confirm the target Cloudflare account (get the Account ID from the dashboard sidebar or `npx wrangler whoami`) — needed for Phase 4's `CLOUDFLARE_ACCOUNT_ID` secret.
- [x] Create a **scoped API token** in the Cloudflare dashboard (My Profile → API Tokens → Create Token) using the **"Edit Cloudflare Workers"** template, scoped to this account only (no DNS, no unrelated projects, no billing). This token is for CI use — the human's own `wrangler login` session already covers local/manual deploys and does not need this token.
- [x] **Extra support step (edge case):** if the account has multiple zones/accounts, double-check the token's account scope matches the account you ran `wrangler login` against — a token scoped to the wrong account fails deploys with an opaque 10000-series auth error, not a clear "wrong account" message.

## Phase 2 — Secrets

External integrations touched: **Supabase** (already wired, needs production credentials) and a **future OpenRouter integration** (not yet in the codebase — `src/` has no OpenRouter references, no route, no env schema entry; treat its secret step below as a placeholder for when that lands, not something to do now).

- [x] Create local `.dev.vars` (gitignored, matches README's documented step): `cp .env.example .dev.vars`, then fill in a real `SUPABASE_URL` / `SUPABASE_KEY` (local `supabase start` output, or a cloud project's Project URL / anon key).
- [x] Provision production secrets on the live Worker: `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY` (each prompts interactively for the value — human-run, not scriptable with a plain value in a command).
- [x] **Extra support step (edge case — silent-null risk from infrastructure.md's Unknown Unknowns):** both `astro.config.mjs`'s `env.schema` entries are `optional: true`, so a missing secret does **not** fail the build — `src/lib/supabase.ts`'s `createClient()` just returns `null`, and auth routes degrade to redirecting with `?error=Supabase is not configured`. After provisioning, don't just check `wrangler secret put` exited 0 — actually load `/auth/signin` on the deployed URL and confirm the form does **not** show that error string, since a typo'd secret name silently no-ops instead of failing loud. Verified against the live URL: no error string present.
- [ ] **If/when OpenRouter integration lands:** add `OPENROUTER_API_KEY: envField.string({ context: "server", access: "secret", optional: true })` to `astro.config.mjs`'s `env.schema` (mirroring the existing two entries), then `npx wrangler secret put OPENROUTER_API_KEY` — note it in that PR's description per infrastructure.md's mitigation for the "missing secret" risk register row.

## Phase 3 — First manual deploy

- [x] Add a `deploy` script to `package.json` for convenience/consistency with `dev`/`build`/`preview`: `"deploy": "wrangler deploy"`.
- [x] Build: `npm run build` (runs `astro build` via the already-configured `@astrojs/cloudflare` adapter — no Cloudflare-specific build step needed).
- [x] Deploy: `npm run deploy` (reads `wrangler.jsonc`, already scaffolded with `compatibility_flags: ["nodejs_compat"]` and the `ASSETS` binding pointing at `./dist`). Required a one-time manual step not in the original plan: registering a `workers.dev` subdomain via the Cloudflare dashboard onboarding page (account had none).
- [x] Note the deployed `*.workers.dev` URL from the deploy output for Phase 5's smoke tests. **Live URL: https://10x-astro-starter.romanj23-f66.workers.dev/** (subdomain: `romanj23-f66`). Confirmed responding with HTTP 200.

## Phase 4 — CI auto-deploy on merge

- [x] Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as GitHub repository secrets (values from Phase 1). Also added `SUPABASE_URL`/`SUPABASE_KEY` repo secrets (previously missing — the existing `ci` job's build step referenced them but they didn't exist; harmless since those env schema fields are `optional: true`, but now consistent).
- [x] Extend `.github/workflows/ci.yml` with a `deploy` job that runs only on `push` to `master` (not on PRs), depends on (`needs:`) the existing `ci` job, and reuses the same `npm ci` / `npx astro sync` / `npm run build` steps (build needs `SUPABASE_URL`/`SUPABASE_KEY` from repo secrets, same as the existing build step) before calling `cloudflare/wrangler-action@v4` with `apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}` and `accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}`.
- [x] **Extra support step (edge case):** `wrangler-action` does not build your project for you — it only runs `wrangler` commands. Confirm the deploy job's build step completes (and produces `./dist`) *before* the action step, in the same job (a separate job wouldn't share the filesystem/artifact by default without an explicit upload/download-artifact step — same job is simpler here). Verified: build step precedes the action step within the single `deploy` job.
- [x] Push a trivial change to `master` (or merge a PR) and confirm the new `deploy` job appears in the Actions tab and succeeds. Pushed commit `f7befc1` — run [34140657020](https://github.com/RomikIT/10xCards/actions/runs/34140657020): `ci` succeeded (1m4s), `deploy` succeeded (42s). Live site re-verified HTTP 200 after the CI deploy.

## Phase 5 — Post-deploy verification (smoke tests)

- [x] `npx wrangler tail` (or `--format=json` for structured output) while exercising the deployed URL, to confirm the Worker serves requests and logs correctly. Ran in background, exercised `/`, `/auth/signin`, `/auth/signup`, `/auth/confirm-email`, `/dashboard`, and a real `POST /api/auth/signup` — all 9 captured requests logged cleanly with status codes, no dropped/errored entries.
- [x] **Extra support step (edge case — the now-closed `withastro/astro#14511` bug):** specifically confirm `/dashboard` (the one route behind `middleware.ts`) renders normally rather than showing a raw `[object Object]` response body. Verified: unauthenticated `GET /dashboard` returns a clean `302` to `/auth/signin` with a real rendered HTML page body (not `[object Object]`) — bug does not reproduce, as predicted.
- [x] Confirm no `?error=Supabase is not configured` appears anywhere in the live flow (see Phase 2's silent-null note). Verified via a real `POST /api/auth/signup` (with matching `Origin` header past Astro's CSRF check) — Supabase actually processed the request and returned its own validation error (`Email address "..." is invalid` for a non-deliverable test domain), proving the Worker's Supabase credentials are live and functioning, not silently null.
- [x] Manually exercise signup → confirm-email → signin → dashboard (protected route) → signout against the **live URL**, not just `astro dev`. Full flow verified by the user in a real browser. **Found and fixed a genuine deployment gap along the way:** Supabase project's Auth → URL Configuration **Site URL** was still the default `http://localhost:3000`, so the confirmation email redirected to an unreachable local URL instead of the live Worker. Root cause: email is confirmed server-side by Supabase *before* the browser redirect fires, so the account was actually already active — signing in directly worked once discovered. User then corrected the Site URL in the Supabase dashboard to `https://10x-astro-starter.romanj23-f66.workers.dev`. After the fix: signin → dashboard (renders correctly) → signout all confirmed working by the user.

## Phase 6 — Ongoing operational guardrails

- [x] Do a one-time rollback drill so the command is proven before it's ever needed under pressure: `npx wrangler deployments list` → `npx wrangler rollback <version-id>`. Rolled back from `24fa0711` (current CI-deployed version) to the prior `794b9462`, verified the live site still responded (HTTP 200), then rolled forward again to `24fa0711` and re-verified (HTTP 200, no Supabase-misconfiguration error). Command is proven.
- [ ] **Standing watch-item, not a one-time step:** if/when the AI-generation (OpenRouter) route is built, check the Cloudflare dashboard's CPU-time metric after testing with a realistic large paste, since Workers bill CPU-ms and local text-processing before the OpenRouter call is exactly the workload infrastructure.md's Devil's-Advocate flagged as likely to cross the free-tier per-invocation threshold silently.
- [ ] **Standing watch-item:** when provisioning the production Supabase project, use its pooled connection string (Supavisor, transaction mode) rather than a direct connection — Workers' many short-lived isolates can open connection bursts that a traditional long-lived Node server wouldn't, and Supabase's docs mostly assume the latter.
- [ ] Re-test the deployed app (not just `npm run build`) after any future `wrangler` or `@astrojs/cloudflare` version bump, since the `nodejs_compat`-adjacent behavior in Phase 5 is version/compat-date-sensitive.

---

## Verification summary

End-to-end proof this worked: a fresh `git push` to `master` triggers CI → lint/build/deploy all green in the Actions tab → the live `*.workers.dev` URL serves the homepage → full signup/confirm/signin/dashboard/signout flow works against that live URL with no Supabase-misconfiguration error and no `[object Object]` response → `wrangler tail` shows clean request logs during that manual exercise → a rollback to the previous version and back succeeds via `wrangler rollback`.

---

## Addendum — Rename: `10x-astro-starter` → `10xcards`

To match the Supabase project name (`10xCards`), the Cloudflare Worker and local package identity were renamed. This is a **new Worker on Cloudflare**, not an in-place rename — Cloudflare has no rename operation, so `wrangler deploy` under the new `name` provisions a brand-new Worker script (and a new auto-provisioned KV namespace for sessions) rather than relabeling the old one.

- [x] `wrangler.jsonc`: `name` changed `10x-astro-starter` → `10xcards`.
- [x] `package.json` / `package-lock.json`: `name` changed `10x-astro-starter` → `10xcards` (lockfile regenerated via `npm install`, not hand-edited).
- **Left unchanged (deliberately):** `context/foundation/tech-stack.md`'s `starter_id: 10x-astro-starter`, `README.md`'s git-clone instructions, `context/changes/bootstrap-verification/verification.md`, and `src/lib/config-status.ts`'s docs link — these correctly name the real upstream open-source starter template this project was scaffolded from, not our deployment identity. Renaming them would misrepresent bootstrap history or break a real external URL.
- [x] Rebuilt (`npm run build`) and redeployed (`npx wrangler deploy`) under the new name. New Worker `10xcards` created, new KV namespace `10xcards-session` auto-provisioned.
- **New live URL: https://10xcards.romanj23-f66.workers.dev/** (same account subdomain `romanj23-f66`, new Worker name). The old `https://10x-astro-starter.romanj23-f66.workers.dev/` Worker still exists on Cloudflare (secrets and all) until explicitly deleted — deleting it is a destructive, human-confirmed action, left to the user's discretion.
- [x] Production secrets re-provisioned on the new Worker (`SUPABASE_URL`, `SUPABASE_KEY`) — secrets are per-Worker-script and do not carry over to a differently-named Worker.
- [x] Full smoke test re-run against the new URL: `/`, `/auth/signin`, `/auth/signup`, `/auth/confirm-email` all `200`; unauthenticated `/dashboard` `302`s cleanly to `/auth/signin` (no `[object Object]`); no `?error=Supabase is not configured` anywhere; a real `POST /api/auth/signup` reached Supabase (got back its own `email rate limit exceeded` response — proof of live connectivity, not a config no-op).
- [x] **Manual step (human-only, dashboard access):** Supabase project's Authentication → URL Configuration → **Site URL** (and Redirect URLs allowlist) updated by the user from the old `10x-astro-starter...` URL to `https://10xcards.romanj23-f66.workers.dev`.
- [x] CI auto-deploy re-verified under the new name — pushed commit `3de777f`, run [34143211520](https://github.com/RomikIT/10xCards/actions/runs/34143211520): `ci` succeeded (1m3s), `deploy` succeeded (50s). Live site re-verified HTTP 200, no Supabase-misconfiguration error, after the CI-driven redeploy.
- [x] Old `10x-astro-starter` Worker deleted by the user. Confirmed removed: `wrangler deployments list --name 10x-astro-starter` now returns "This Worker does not exist on your account" (code 10007), and the old URL 404s.
- [x] Final full re-verification of the live `10xcards` Worker after both changes: `/` `200`, `/auth/signin` `200`, unauthenticated `/dashboard` `302`s to signin, no `?error=Supabase is not configured` anywhere.
