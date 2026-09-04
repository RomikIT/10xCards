---
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
---

## Why this stack

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
