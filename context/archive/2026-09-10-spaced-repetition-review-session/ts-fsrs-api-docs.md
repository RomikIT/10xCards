# ts-fsrs — API docs (fetched via context7)

Source: `/open-spaced-repetition/ts-fsrs` (context7 library ID; source reputation: High, 454 code snippets, benchmark 87.84).

Fetched for S-04 (`spaced-repetition-review-session`) to unblock the library-choice Unknown and inform the review-state schema on `flashcards`.

## Install & initialize scheduler

```typescript
import { fsrs, createEmptyCard, Rating, State } from 'ts-fsrs'

const scheduler = fsrs({
  request_retention: 0.9,      // 90% recall target
  maximum_interval: 36500,     // 100 year max
  enable_fuzz: true,           // randomize intervals
  enable_short_term: true,     // use learning steps
  learning_steps: ['1m', '10m'],
  relearning_steps: ['10m'],
})
```

Default parameters also work: `const scheduler = fsrs()`.

## Creating a new card

```typescript
const card1 = createEmptyCard()
console.log(card1.state)     // State.New
console.log(card1.stability) // 0

const card2 = createEmptyCard(new Date('2024-01-15'))
console.log(card2.due) // 2024-01-15

// With transformer — map straight to a custom DTO/row shape
const cardDTO = createEmptyCard(new Date(), (card) => ({
  ...card,
  id: crypto.randomUUID(),
  due: card.due.getTime(),
}))
```

## Reviewing / grading a card

```typescript
const scheduler = fsrs()
const card = createEmptyCard()

// Preview all four possible outcomes before the user answers (optional, for UI)
const preview = scheduler.repeat(card, new Date())
console.log(preview[Rating.Again].card)
console.log(preview[Rating.Hard].card)
console.log(preview[Rating.Good].card)
console.log(preview[Rating.Easy].card)

// Apply the final rating after the user has answered
const result = scheduler.next(card, new Date(), Rating.Good)
console.log(result.card) // updated Card
console.log(result.log)  // ReviewLog for this review event
```

### Rating enum

```typescript
Rating.Again
Rating.Hard
Rating.Good
Rating.Easy
```

## `Card` interface — fields relevant to schema design

```typescript
interface Card {
  due: Date              // next scheduled review date
  stability: number       // memory stability ("ease factor" equivalent)
  difficulty: number      // card difficulty
  elapsed_days: number    // deprecated — skip in new schemas
  scheduled_days: number  // interval until next review (days)
  learning_steps: number  // current learning-step index
  reps: number            // total review count
  lapses: number          // times forgotten
  state: State            // New | Learning | Review | Relearning
  last_review?: Date      // date of most recent review
}
```

### `State` enum

```typescript
enum State {
  New = 0,
  Learning = 1,
  Review = 2,
  Relearning = 3,
}
```

## `ReviewLog` — one row per review event (optional history table)

```typescript
interface ReviewLog {
  rating: Rating
  state: State                   // card state at time of review
  due: Date                      // due date before this review
  stability: number              // stability before this review
  difficulty: number              // difficulty before this review
  elapsed_days: number            // deprecated
  last_elapsed_days: number       // deprecated
  scheduled_days: number          // days until next review, after this review
  learning_steps: number
  review: Date                    // when the review happened
}

type RecordLogItem = {
  card: Card
  log: ReviewLog
}
```

## Converting stored/raw data back to typed `Card`

Postgres/Supabase will round-trip `due` / `last_review` as ISO strings and `state` possibly as a string — normalize on read:

```typescript
import { TypeConvert } from 'ts-fsrs'

const input = {
  state: 'Review',
  due: 1705276800000,
  stability: 5.0,
  difficulty: 3.5,
  reps: 10,
  lapses: 1,
  scheduled_days: 5,
  learning_steps: 0,
  elapsed_days: 3,
  last_review: '2024-01-15T10:00:00Z',
}

const card = TypeConvert.card(input)
console.log(card.state)                // State.Review (2)
console.log(card.due instanceof Date)  // true
```

## Suggested mapping to `flashcards` review-state columns

For the F-01-extension this slice needs (per roadmap S-04: "due date, ease factor, interval"):

| `Card` field | Suggested column | Notes |
|---|---|---|
| `due` | `due` (timestamptz) | next review date |
| `stability` | `stability` (numeric) | ease-factor equivalent |
| `difficulty` | `difficulty` (numeric) | |
| `state` | `state` (smallint / enum) | `New/Learning/Review/Relearning` |
| `reps` | `reps` (integer) | |
| `lapses` | `lapses` (integer) | |
| `scheduled_days` | `scheduled_days` (integer) | |
| `learning_steps` | `learning_steps` (integer) | |
| `last_review` | `last_review` (timestamptz, nullable) | |
| `elapsed_days` | — (skip) | deprecated field in ts-fsrs |

`ReviewLog` per-review history is optional for MVP — only needed if a review-history table/audit trail is in scope; not required to satisfy FR-009/FR-010 on their own.
