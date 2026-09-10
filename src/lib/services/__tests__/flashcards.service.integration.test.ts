import { afterEach, describe, expect, it } from "vitest";
import { createFlashcard, updateFlashcard, deleteFlashcard } from "@/lib/services/flashcards.service";
import { createTwoRealUsers, type RealSupabaseUsers } from "./helpers/real-supabase";

// Risk #3 (test-plan.md §2 / research.md "Risk #3" verdict): no service
// function filters by user_id — RLS is the sole boundary, so this must run
// against real Postgres with two real authenticated users, never a mocked
// Supabase client.
describe("flashcards.service cross-user IDOR (Risk #3)", () => {
  let users: RealSupabaseUsers | undefined;

  afterEach(async () => {
    if (users) {
      await users.cleanup();
      users = undefined;
    }
  });

  it("user B cannot update user A's flashcard, even with the correct id", async () => {
    users = await createTwoRealUsers();
    const { userA, userB } = users;

    const created = await createFlashcard(userA.client, userA.id, {
      question: "Original question",
      answer: "Original answer",
    });
    if (!("data" in created)) {
      throw new Error(`Setup failed to create flashcard: ${JSON.stringify(created)}`);
    }
    const flashcardId = created.data.id;

    const attempt = await updateFlashcard(userB.client, flashcardId, {
      question: "Hijacked question",
      answer: "Hijacked answer",
    });

    // RLS returns an empty result array for a row B doesn't own — the service
    // must translate that into notFound, never {data} and never {error}.
    expect(attempt).toEqual({ notFound: true });

    // Prove the row still exists and is still owned by A (ruling out "notFound
    // because the row was actually deleted/corrupted" as a false positive).
    const verify = await updateFlashcard(userA.client, flashcardId, {
      question: "Original question",
      answer: "Original answer",
    });
    expect("data" in verify).toBe(true);
    if ("data" in verify) {
      expect(verify.data.question).toBe("Original question");
    }
  });

  it("user B cannot delete user A's flashcard, even with the correct id", async () => {
    users = await createTwoRealUsers();
    const { userA, userB } = users;

    const created = await createFlashcard(userA.client, userA.id, {
      question: "Another question",
      answer: "Another answer",
    });
    if (!("data" in created)) {
      throw new Error(`Setup failed to create flashcard: ${JSON.stringify(created)}`);
    }
    const flashcardId = created.data.id;

    const attempt = await deleteFlashcard(userB.client, flashcardId);
    expect(attempt).toEqual({ notFound: true });

    // Prove the row still exists and is still owned by A: A can delete it for real.
    const verify = await deleteFlashcard(userA.client, flashcardId);
    expect(verify).toEqual({ ok: true });
  });
});
