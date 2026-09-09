---
change_id: ai-generated-flashcard-review
title: Convert pasted study text into AI-generated, reviewable flashcards
status: impl_reviewed
created: 2026-09-09
updated: 2026-09-09
archived_at: null
---

## Notes

Sourced from roadmap slice S-02 (`context/foundation/roadmap.md`).

- Outcome: user can paste study text, get AI flashcard candidates, and accept/edit/reject them before saving to their deck.
- PRD refs: FR-003, FR-004, US-01
- Prerequisites: F-01 (minimal-flashcard-schema, in-progress), S-01 (account-signup-and-login, in-progress)
- Unknowns from roadmap (non-blocking): which prompt/extraction approach hits the 75% acceptance target needs real-text testing; OpenRouter API key must be provisioned as a Worker secret (`wrangler secret put`) before production.
