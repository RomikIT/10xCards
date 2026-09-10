---
change_id: testing-bootstrap-ai-review-critical-path
title: Bootstrap Vitest and cover AI review critical path (Risks #1, #2)
status: implemented
created: 2026-09-10
updated: 2026-09-10
archived_at: null
---

## Notes

Rollout Phase 1 of `context/foundation/test-plan.md` §3. Stand up Vitest and
defend Risk #1 + Risk #2 at the cheapest layer (unit + integration).

Risks covered:

- **#1** — User accepts/edits/rejects an AI-generated candidate, and the
  server persists something other than what they saw (original instead of
  edit, a duplicate from a double-click, or a rejected candidate saved
  anyway).
- **#2** — OpenRouter is unavailable, returns an invalid key error, or
  returns malformed data, and the user sees a hang or a raw error instead
  of a clear, actionable message.

Risk response intent (see test-plan.md §2 Risk Response Guidance for full
detail):

- **#1**: Accepting a candidate as-is saves exactly what was shown; editing
  before accepting saves the edit, not the original; rejecting never
  triggers a network call; a double-click on Accept/Reject doesn't produce
  a duplicate save. Challenge: removal from the client-side list is not
  proof the server-side save actually succeeded or matched what was shown.
  Avoid the oracle problem — assert against the actually-saved
  flashcard/network payload, not the component's internal state.
- **#2**: When OpenRouter is unavailable, returns an invalid-key error, or
  returns malformed data, the user sees a clear message — not a hang, not a
  raw 500, not a silent empty result presented as "nothing to review".
  Challenge: a 200 response from OpenRouter does not by itself mean valid
  candidates. Avoid mocking away the JSON-schema parsing/validation logic
  itself.

Test types planned: unit + integration (Vitest, per Astro's official
`getViteConfig()` guidance).
