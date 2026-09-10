---
change_id: spaced-repetition-review-session
title: User can review due flashcards via spaced repetition
status: archived
created: 2026-09-10
updated: 2026-09-10
archived_at: 2026-09-10T07:23:04Z
---

## Notes

Sourced from `context/foundation/roadmap.md`, slice **S-04: User can review due flashcards via spaced repetition** (Change ID: `spaced-repetition-review-session`).

- **Outcome:** user can start a review session where due flashcards — scheduled by a chosen spaced-repetition algorithm — are served, and grade their recall to update the schedule. Landing this includes picking a ready-made spaced-repetition library and adding its review-state columns (e.g. due date, ease factor, interval) to the `flashcards` table.
- **PRD refs:** FR-009, FR-010
- **Prerequisites:** F-01 (`minimal-flashcard-schema`, in-progress), S-02 (`ai-generated-flashcard-review`, in-progress)
- **Status in roadmap:** blocked — no spaced-repetition library/algorithm is named anywhere in the PRD or `tech-stack.md` yet (Non-Goals rules out building one from scratch). Owner: user. Block: yes.
