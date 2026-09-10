import { afterEach, describe, expect, it, vi } from "vitest";
import type { AstroCookies } from "astro";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";
import { updateFlashcard, deleteFlashcard } from "@/lib/services/flashcards.service";
import { PATCH, DELETE } from "../[id]";
import type { Flashcard } from "@/types";

// Both routes call createClient() before delegating to the service, so route
// tests need both mocks: @/lib/supabase for the auth-guard/null-client cases,
// and the service module for the notFound/error/success mapping cases (see
// plan.md "Critical Implementation Details" — the double-mock pattern).
vi.mock("@/lib/supabase", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/services/flashcards.service", () => ({
  updateFlashcard: vi.fn(),
  deleteFlashcard: vi.fn(),
}));

const AUTHENTICATED_USER = { id: "user-1" };
const FLASHCARD_ID = "flashcard-1";
const VALID_BODY = JSON.stringify({ question: "What is Vitest?", answer: "A Vite-native test runner." });
const FAKE_CLIENT = {} as unknown as SupabaseClient;

function makePatchContext(
  user: { id: string } | null,
  id: string | undefined,
  body: string,
): Parameters<typeof PATCH>[0] {
  return {
    locals: { user },
    request: new Request(`http://localhost/api/flashcards/${id ?? ""}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body,
    }),
    cookies: {} as AstroCookies,
    params: { id },
  } as unknown as Parameters<typeof PATCH>[0];
}

function makeDeleteContext(user: { id: string } | null, id: string | undefined): Parameters<typeof DELETE>[0] {
  return {
    locals: { user },
    request: new Request(`http://localhost/api/flashcards/${id ?? ""}`, { method: "DELETE" }),
    cookies: {} as AstroCookies,
    params: { id },
  } as unknown as Parameters<typeof DELETE>[0];
}

describe("PATCH /api/flashcards/[id]", () => {
  afterEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(updateFlashcard).mockReset();
  });

  it("returns 401 when there is no authenticated user", async () => {
    const response = await PATCH(makePatchContext(null, FLASHCARD_ID, VALID_BODY));

    expect(response.status).toBe(401);
    expect(updateFlashcard).not.toHaveBeenCalled();
  });

  it("returns 500 internal_error when createClient returns null", async () => {
    vi.mocked(createClient).mockReturnValue(null);

    const response = await PATCH(makePatchContext(AUTHENTICATED_USER, FLASHCARD_ID, VALID_BODY));

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("internal_error");
  });

  it("returns 400 validation_error for an invalid JSON body", async () => {
    vi.mocked(createClient).mockReturnValue(FAKE_CLIENT);

    const response = await PATCH(makePatchContext(AUTHENTICATED_USER, FLASHCARD_ID, "not valid json"));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("validation_error");
    expect(updateFlashcard).not.toHaveBeenCalled();
  });

  it("returns 400 validation_error when question/answer fail the length check", async () => {
    vi.mocked(createClient).mockReturnValue(FAKE_CLIENT);

    const response = await PATCH(
      makePatchContext(AUTHENTICATED_USER, FLASHCARD_ID, JSON.stringify({ question: "", answer: "" })),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("validation_error");
    expect(updateFlashcard).not.toHaveBeenCalled();
  });

  it("returns 404 not_found when the service reports notFound", async () => {
    vi.mocked(createClient).mockReturnValue(FAKE_CLIENT);
    vi.mocked(updateFlashcard).mockResolvedValueOnce({ notFound: true });

    const response = await PATCH(makePatchContext(AUTHENTICATED_USER, FLASHCARD_ID, VALID_BODY));

    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("not_found");
  });

  it("returns 400 validation_error when the service itself reports a validation_error", async () => {
    vi.mocked(createClient).mockReturnValue(FAKE_CLIENT);
    vi.mocked(updateFlashcard).mockResolvedValueOnce({
      error: { code: "validation_error", message: "Question and answer must be between 1 and 2000 characters." },
    });

    const response = await PATCH(makePatchContext(AUTHENTICATED_USER, FLASHCARD_ID, VALID_BODY));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 500 internal_error when the service reports an internal_error", async () => {
    vi.mocked(createClient).mockReturnValue(FAKE_CLIENT);
    vi.mocked(updateFlashcard).mockResolvedValueOnce({
      error: { code: "internal_error", message: "Something went wrong. Please try again." },
    });

    const response = await PATCH(makePatchContext(AUTHENTICATED_USER, FLASHCARD_ID, VALID_BODY));

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("internal_error");
  });

  it("returns 200 with the updated flashcard on success", async () => {
    vi.mocked(createClient).mockReturnValue(FAKE_CLIENT);
    const flashcard = {
      id: FLASHCARD_ID,
      question: "What is Vitest?",
      answer: "A Vite-native test runner.",
    } as Flashcard;
    vi.mocked(updateFlashcard).mockResolvedValueOnce({ data: flashcard });

    const response = await PATCH(makePatchContext(AUTHENTICATED_USER, FLASHCARD_ID, VALID_BODY));

    expect(response.status).toBe(200);
    const body = (await response.json()) as { flashcard: Flashcard };
    expect(body.flashcard).toEqual(flashcard);
    expect(updateFlashcard).toHaveBeenCalledWith(FAKE_CLIENT, FLASHCARD_ID, {
      question: "What is Vitest?",
      answer: "A Vite-native test runner.",
    });
  });
});

describe("DELETE /api/flashcards/[id]", () => {
  afterEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(deleteFlashcard).mockReset();
  });

  it("returns 401 when there is no authenticated user", async () => {
    const response = await DELETE(makeDeleteContext(null, FLASHCARD_ID));

    expect(response.status).toBe(401);
    expect(deleteFlashcard).not.toHaveBeenCalled();
  });

  it("returns 500 internal_error when createClient returns null", async () => {
    vi.mocked(createClient).mockReturnValue(null);

    const response = await DELETE(makeDeleteContext(AUTHENTICATED_USER, FLASHCARD_ID));

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("internal_error");
  });

  it("returns 404 not_found when the service reports notFound", async () => {
    vi.mocked(createClient).mockReturnValue(FAKE_CLIENT);
    vi.mocked(deleteFlashcard).mockResolvedValueOnce({ notFound: true });

    const response = await DELETE(makeDeleteContext(AUTHENTICATED_USER, FLASHCARD_ID));

    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("not_found");
  });

  it("returns 500 internal_error when the service reports an error", async () => {
    vi.mocked(createClient).mockReturnValue(FAKE_CLIENT);
    vi.mocked(deleteFlashcard).mockResolvedValueOnce({
      error: { code: "internal_error", message: "Something went wrong. Please try again." },
    });

    const response = await DELETE(makeDeleteContext(AUTHENTICATED_USER, FLASHCARD_ID));

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("internal_error");
  });

  it("returns 204 with no body on success", async () => {
    vi.mocked(createClient).mockReturnValue(FAKE_CLIENT);
    vi.mocked(deleteFlashcard).mockResolvedValueOnce({ ok: true });

    const response = await DELETE(makeDeleteContext(AUTHENTICATED_USER, FLASHCARD_ID));

    expect(response.status).toBe(204);
    expect(deleteFlashcard).toHaveBeenCalledWith(FAKE_CLIENT, FLASHCARD_ID);
  });
});
