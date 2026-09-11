---
change_id: testing-auth-resilience-regression-guard
title: Auth exception-handling regression guard tests
status: new
created: 2026-09-11
updated: 2026-09-11
archived_at: null
---

## Notes

Open a change folder for rollout Phase 3 of context/foundation/test-plan.md: "Auth resilience regression guard".
Risks covered: #5. Test types planned: unit.
Risk response intent: #5: prove an exception thrown by any Supabase Auth SDK call (signup, signin, signout, middleware session resolution) never reaches the client as a raw, unhandled 500. Challenge: the existing wrapper is assumed to cover every current and future auth call site without re-verification. Context to ground: the exact call sites routed through the existing exception-handling wrapper today, and whether middleware.ts's session resolution uses it too. Likely cheapest layer: unit (force a thrown exception, assert graceful mapping). Anti-pattern to avoid: a test that never actually throws (would pass identically even if the try/catch were deleted).
After creating the folder, follow the downstream continuation rule.
