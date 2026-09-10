---
change_id: testing-authorization-data-integrity-coverage
title: Cross-user authorization and FSRS grading integration tests
status: implemented
created: 2026-09-11
updated: 2026-09-11
archived_at: null
---

## Notes

Open a change folder for rollout Phase 2 of context/foundation/test-plan.md: "Authorization and data-integrity coverage".
Risks covered: #3, #4. Test types planned: integration.

Risk response intent (see test-plan.md §2 Risk Response Guidance for full detail):
- #3: A second, different authenticated user can never read, update, or delete the first user's flashcard through the API, even when passing the correct row id. Challenge: DB-level RLS alone is not sufficient proof — the manual-flashcard-management plan already found RLS returns an empty result array (not an error) for someone else's row, which the route layer must translate into 404. Context to ground: the exact not-found mapping per route, and whether newer routes (e.g. review grading) got the same treatment as the original CRUD routes. Likely cheapest layer: integration (two distinct real authenticated sessions). Anti-pattern to avoid: testing only "no auth → 401" without also testing "authenticated but not the owner → 404/403" (the actual IDOR case).
- #4: Grading with each of the 4 ratings (Again/Hard/Good/Easy) transitions a card's FSRS state consistent with ts-fsrs's own scheduling semantics — not just "some fields changed". Challenge: the DB round-trip (row → typed Card → scheduler → persisted row) is assumed lossless; type/format coercion at the Postgres boundary is exactly where integration bugs hide. Context to ground: the column-to-Card field mapping in the review service, and whether an out-of-range rating value can reach the grading logic. Likely cheapest layer: integration (against a real/local Supabase row, not a hand-built Card object — the mapping itself is the risk). Anti-pattern to avoid: asserting the exact due-date/stability values ts-fsrs's internal algorithm produces (oracle problem); assert the shape of the transition instead (state changes, due moves forward, reps increments) and treat the library's own correctness as out of scope.

After creating the folder, follow the downstream continuation rule.
