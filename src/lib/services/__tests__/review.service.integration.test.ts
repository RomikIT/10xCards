import { afterEach, describe, expect, it } from "vitest";
import { Rating } from "ts-fsrs";
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
