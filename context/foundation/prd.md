---
project: "10xCards"
version: 1
status: draft
created: 2026-09-04
context_type: greenfield
product_type: web-app
target_scale:
  users: medium
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: 2026-09-14
  after_hours_only: true
---

## Vision & Problem Statement

Professionals preparing for a certification exam want to use spaced repetition to retain their study material, but manually authoring high-quality flashcards from that material — notes, guides, textbook excerpts — is slow and tedious. This friction discourages them from using spaced repetition at all, even though it is a proven, effective learning method.

Existing flashcard/SRS tools solve half the problem: Anki-style tools have a real algorithm but demand heavy manual card creation; simpler tools are easy to use but lack a real spaced-repetition engine. Neither pairs a real SRS algorithm with low-effort card creation — AI-assisted generation from arbitrary pasted text closes that gap.

## User & Persona

**Primary persona**: A working professional preparing for a certification exam (e.g. an IT, finance, or project-management certification), studying around a full-time job. They have accumulated study material — notes, guides, textbook excerpts — and want to convert it into flashcards for spaced-repetition review without spending hours manually writing each card. They reach for the product right after reviewing a chunk of material (to turn it into cards quickly) and again at the start of each study session (to review due cards via the SRS algorithm).

## Success Criteria

### Primary
- 75% of AI-generated flashcards are accepted by the user (not rejected/discarded).
- 75% of all flashcards created are created via the AI-generation path (vs. fully manual entry).

### Secondary
- Users return for repeat study sessions — e.g. a user who created flashcards comes back within a week to actually review them via spaced repetition.

### Guardrails
- Users' flashcard data must never be lost or corrupted, regardless of AI acceptance rates or feature usage.

## User Stories

### US-01: User converts pasted study text into reviewable flashcards

- **Given** a logged-in user with a block of study text
- **When** they paste it and request AI-generated flashcards
- **Then** they see a set of candidate flashcards they can accept, edit, or reject one by one, and accepted ones are saved to their deck

#### Acceptance Criteria
- Rejected candidates are discarded and never saved
- Edited candidates are saved with the user's edits, not the original AI output
- An empty or unusable input text shows an explanatory message, not a silent failure

## Functional Requirements

### Authentication
- FR-001: User can sign up for an account with email + password. Priority: must-have
  > Socrates: No counter-argument identified; kept as written.
- FR-002: User can log in with email + password. Priority: must-have
  > Socrates: No counter-argument identified; kept as written.

### AI Flashcard Generation
- FR-003: User can paste a block of text and request AI-generated flashcard candidates from it. Priority: must-have
  > Socrates: No counter-argument identified; kept as written.
- FR-004: User can review each AI-generated candidate and accept, edit, or reject it before it's saved. Priority: must-have
  > Socrates: No counter-argument identified; kept as written.

### Manual Flashcard Management
- FR-005: User can manually create a flashcard (question + answer) without AI. Priority: must-have
  > Socrates: No counter-argument identified; kept as written.
- FR-006: User can view their list of saved flashcards. Priority: must-have
  > Socrates: No counter-argument identified; kept as written.
- FR-007: User can edit an existing flashcard. Priority: must-have
  > Socrates: No counter-argument identified; kept as written.
- FR-008: User can delete an existing flashcard. Priority: must-have
  > Socrates: No counter-argument identified; kept as written.

### Spaced Repetition Review
- FR-009: User can start a review session where due flashcards are served according to a spaced-repetition algorithm. Priority: must-have
  > Socrates: No counter-argument identified; kept as written.
- FR-010: User can grade their recall of a reviewed flashcard to feed the SRS algorithm's scheduling. Priority: must-have
  > Socrates: No counter-argument identified; kept as written.

## Non-Functional Requirements

- A user sees acknowledgement that their text was received within a short time, and continuous visible progress during any AI-generation request that takes longer than two seconds.
- Study text submitted for AI generation is not retained or exposed beyond what is needed to serve that request.
- The product remains usable on the latest two major versions of mainstream desktop and mobile browsers.

## Business Logic

Given a block of raw study text, the app decides which fragments of that text are worth turning into a question/answer pair, and phrases each as a standalone flashcard suitable for spaced-repetition study.

The input is a block of free-form text the user pastes — their own study material such as notes, guides, or textbook excerpts. The output is a set of candidate question/answer pairs, each representing one discrete fact or concept extracted from the input. The user encounters this rule immediately after submitting text: they see the generated candidates and review, edit, or reject each one before it becomes a permanent flashcard in their deck.

## Access Control

Login via email + password. Every account is a flat user type — no admin/moderator role for MVP. Each user can only create, view, edit, and delete their own flashcards; there is no cross-user visibility or sharing.

## Non-Goals

- **No custom spaced-repetition algorithm.** The MVP integrates a ready-made SRS algorithm rather than implementing SuperMemo/Anki-style scheduling from scratch — building a competitive scheduling algorithm is a project in itself and isn't the product's value proposition.
- **No import of non-text formats (PDF, DOCX, etc.).** Input is copy-pasted text only; file parsing is out of scope for the MVP.
- **No sharing or collaboration between users.** Each user's flashcards are single-tenant and single-owner; no shared decks or team workspaces.
- **No mobile app or third-party platform integrations.** Web only for the MVP; no native mobile app, no integrations with other education platforms.

## Open Questions

1. **Hard deadline (2026-09-14) is shorter than the committed 3-week MVP estimate.** User chose to keep both as recorded — the deadline is aspirational (tied to a personal certification exam date), not a hard ship gate for the software. Owner: user. By: n/a (informational, not blocking).
