import { afterEach, describe, expect, it } from "vitest";
import { Rating, State } from "ts-fsrs";
import { createFlashcard } from "@/lib/services/flashcards.service";
import { gradeFlashcardReview } from "@/lib/services/review.service";
import { createTwoRealUsers, type RealSupabaseUsers } from "./helpers/real-supabase";
import type { Flashcard } from "@/types";

// Risk #3 (test-plan.md §2 / research.md "Risk #3" verdict): the newer
// grading route/service must get the same cross-user protection as the
// original CRUD routes — proven here against real Postgres RLS.
describe("review.service cross-user IDOR (Risk #3)", () => {
  let users: RealSupabaseUsers | undefined;

  afterEach(async () => {
    if (users) {
      await users.cleanup();
      users = undefined;
    }
  });

  it("user B cannot grade user A's flashcard, even with the correct id", async () => {
    users = await createTwoRealUsers();
    const { userA, userB } = users;

    const created = await createFlashcard(userA.client, userA.id, { question: "Q", answer: "A" });
    if (!("data" in created)) {
      throw new Error(`Setup failed to create flashcard: ${JSON.stringify(created)}`);
    }
    const flashcardId = created.data.id;
    const beforeReps = created.data.reps;
    const beforeState = created.data.state;

    const attempt = await gradeFlashcardReview(userB.client, flashcardId, Rating.Good);
    expect(attempt).toEqual({ notFound: true });

    // Confirm A's row was not mutated by B's attempt.
    const { data: rows, error } = await userA.client.from("flashcards").select("*").eq("id", flashcardId);
    if (error) {
      throw new Error(`Verification fetch failed: ${JSON.stringify(error)}`);
    }
    const row = (rows as Flashcard[])[0];
    expect(row.reps).toBe(beforeReps);
    expect(row.state).toBe(beforeState);
  });
});

// Risk #4 (test-plan.md §2 / research.md "Risk #4" verdict): ts-fsrs's
// TypeConvert.card() coerces only state/due/last_review — stability,
// difficulty, reps, lapses, scheduled_days, and learning_steps pass through
// unconverted, so this must run against a real fetched-and-persisted
// Postgres row, never a hand-built Card object.
describe("review.service FSRS grading data-integrity (Risk #4)", () => {
  let users: RealSupabaseUsers | undefined;

  afterEach(async () => {
    if (users) {
      await users.cleanup();
      users = undefined;
    }
  });

  it.each([
    ["Again", Rating.Again],
    ["Hard", Rating.Hard],
    ["Good", Rating.Good],
    ["Easy", Rating.Easy],
  ])(
    "grading a new card with %s produces a plausible FSRS transition with real numeric types",
    async (_label, rating) => {
      users = await createTwoRealUsers();
      const { userA } = users;

      const created = await createFlashcard(userA.client, userA.id, { question: "Q", answer: "A" });
      if (!("data" in created)) {
        throw new Error(`Setup failed to create flashcard: ${JSON.stringify(created)}`);
      }
      const before = created.data;

      const result = await gradeFlashcardReview(userA.client, before.id, rating);
      if (!("data" in result)) {
        throw new Error(`Grading failed: ${JSON.stringify(result)}`);
      }
      const after = result.data;

      // Shape of the transition, not exact values (test-plan.md §2 Risk #4:
      // never assert the exact due/stability values ts-fsrs's own algorithm
      // produces — that's out of scope, an oracle problem).
      expect(after.state).not.toBe(State.New);
      expect(new Date(after.due).getTime()).toBeGreaterThan(new Date(before.due).getTime());
      expect(after.reps).toBe(before.reps + 1);

      // Core Risk #4 assertion: these 6 fields are NOT coerced by
      // TypeConvert.card() (research.md) — they must survive the real Postgres
      // round-trip as actual JS numbers, not strings, or fsrs().next() would be
      // silently fed corrupt input on a future, unrelated regression.
      expect(typeof after.stability).toBe("number");
      expect(typeof after.difficulty).toBe("number");
      expect(typeof after.reps).toBe("number");
      expect(typeof after.lapses).toBe("number");
      expect(typeof after.scheduled_days).toBe("number");
      expect(typeof after.learning_steps).toBe("number");
    },
  );

  it("grading an already-lapsed (Review-state) card with Again transitions it to Relearning and increments lapses", async () => {
    users = await createTwoRealUsers();
    const { userA } = users;

    const created = await createFlashcard(userA.client, userA.id, { question: "Q2", answer: "A2" });
    if (!("data" in created)) {
      throw new Error(`Setup failed to create flashcard: ${JSON.stringify(created)}`);
    }
    const flashcardId = created.data.id;

    // Seed a specific starting state via a real UPDATE as the owning user
    // (plan.md "Critical Implementation Details"), not a hand-built Card: a
    // card already in Review state with prior progress, to reach the one
    // transition a single grade of a brand-new card can't (relapse).
    const { error: seedError } = await userA.client
      .from("flashcards")
      .update({ state: State.Review, stability: 5, difficulty: 5, reps: 3, scheduled_days: 10 })
      .eq("id", flashcardId);
    if (seedError) {
      throw new Error(`Seed failed: ${JSON.stringify(seedError)}`);
    }

    const result = await gradeFlashcardReview(userA.client, flashcardId, Rating.Again);
    if (!("data" in result)) {
      throw new Error(`Grading failed: ${JSON.stringify(result)}`);
    }

    // ts-fsrs's default relearning_steps (["10m"]) always routes a lapsed
    // Review-state card through Relearning, and unconditionally increments
    // lapses (node_modules/ts-fsrs/dist/index.umd.js BasicScheduler.reviewState).
    expect(result.data.state).toBe(State.Relearning);
    expect(result.data.lapses).toBe(1);
  });
});
