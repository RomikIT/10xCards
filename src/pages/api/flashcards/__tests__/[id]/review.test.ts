import { afterEach, describe, expect, it, vi } from "vitest";
import type { AstroCookies } from "astro";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Rating } from "ts-fsrs";
import { createClient } from "@/lib/supabase";
import { gradeFlashcardReview } from "@/lib/services/review.service";
import { POST } from "../../[id]/review";
import type { Flashcard } from "@/types";

// Same double-mock shape as [id].test.ts: the route calls createClient()
// before delegating to review.service, so both @/lib/supabase and the
// service module need mocking (plan.md "Critical Implementation Details").
vi.mock("@/lib/supabase", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/services/review.service", () => ({
  gradeFlashcardReview: vi.fn(),
}));

const AUTHENTICATED_USER = { id: "user-1" };
const FLASHCARD_ID = "flashcard-1";
const FAKE_CLIENT = {} as unknown as SupabaseClient;

function makeContext(user: { id: string } | null, id: string | undefined, body: unknown): Parameters<typeof POST>[0] {
  return {
    locals: { user },
    request: new Request(`http://localhost/api/flashcards/${id ?? ""}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    cookies: {} as AstroCookies,
    params: { id },
  } as unknown as Parameters<typeof POST>[0];
}

describe("POST /api/flashcards/[id]/review", () => {
  afterEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(gradeFlashcardReview).mockReset();
  });

  it("returns 401 when there is no authenticated user", async () => {
    const response = await POST(makeContext(null, FLASHCARD_ID, { rating: Rating.Good }));

    expect(response.status).toBe(401);
    expect(gradeFlashcardReview).not.toHaveBeenCalled();
  });

  it("returns 500 internal_error when createClient returns null", async () => {
    vi.mocked(createClient).mockReturnValue(null);

    const response = await POST(makeContext(AUTHENTICATED_USER, FLASHCARD_ID, { rating: Rating.Good }));

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("internal_error");
  });

  it("returns 400 validation_error for an invalid JSON body", async () => {
    vi.mocked(createClient).mockReturnValue(FAKE_CLIENT);

    const response = await POST(makeContext(AUTHENTICATED_USER, FLASHCARD_ID, "not valid json"));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("validation_error");
    expect(gradeFlashcardReview).not.toHaveBeenCalled();
  });

  // Risk #4 guard proof (research.md "Risk #4" verdict, plan.md Phase 1): none
  // of these values are a valid Grade (Rating.Manual=0 is deliberately excluded
  // from GRADE_VALUES in [id]/review.ts), so the service must never be reached.
  it.each([
    ["Rating.Manual (0)", Rating.Manual],
    ["an out-of-range number", 5],
    ["a negative number", -1],
    ["a numeric string", "3"],
    ["a rating name string", "Good"],
    ["null", null],
    ["undefined (missing)", undefined],
  ])("returns 400 validation_error and never calls the service for %s", async (_label, rating) => {
    vi.mocked(createClient).mockReturnValue(FAKE_CLIENT);

    const response = await POST(makeContext(AUTHENTICATED_USER, FLASHCARD_ID, { rating }));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("validation_error");
    expect(gradeFlashcardReview).not.toHaveBeenCalled();
  });

  it("returns 404 not_found when the service reports notFound", async () => {
    vi.mocked(createClient).mockReturnValue(FAKE_CLIENT);
    vi.mocked(gradeFlashcardReview).mockResolvedValueOnce({ notFound: true });

    const response = await POST(makeContext(AUTHENTICATED_USER, FLASHCARD_ID, { rating: Rating.Good }));

    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("not_found");
  });

  it("returns 500 internal_error when the service reports an error", async () => {
    vi.mocked(createClient).mockReturnValue(FAKE_CLIENT);
    vi.mocked(gradeFlashcardReview).mockResolvedValueOnce({
      error: { code: "internal_error", message: "Something went wrong. Please try again." },
    });

    const response = await POST(makeContext(AUTHENTICATED_USER, FLASHCARD_ID, { rating: Rating.Good }));

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("internal_error");
  });

  it("returns 200 with the graded flashcard on success", async () => {
    vi.mocked(createClient).mockReturnValue(FAKE_CLIENT);
    const flashcard = { id: FLASHCARD_ID, reps: 1 } as Flashcard;
    vi.mocked(gradeFlashcardReview).mockResolvedValueOnce({ data: flashcard });

    const response = await POST(makeContext(AUTHENTICATED_USER, FLASHCARD_ID, { rating: Rating.Good }));

    expect(response.status).toBe(200);
    const body = (await response.json()) as { flashcard: Flashcard };
    expect(body.flashcard).toEqual(flashcard);
    expect(gradeFlashcardReview).toHaveBeenCalledWith(FAKE_CLIENT, FLASHCARD_ID, Rating.Good);
  });
});
