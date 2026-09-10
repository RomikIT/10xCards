import { afterEach, describe, expect, it, vi } from "vitest";
import { generateFlashcardCandidates } from "@/lib/services/ai-flashcard-generation.service";
import { POST } from "../generate";

// Thin route-level coverage (Risk #2, test-plan.md §2 / research.md "Risk #2"
// verdict): the service module is mocked so none of Phase 4's 8 OpenRouter
// failure branches are re-exercised here — this file only asserts what the
// route itself owns: auth guard, input-length validation, and the
// {error} -> 502 / {data} -> 200 mapping.
vi.mock("@/lib/services/ai-flashcard-generation.service", () => ({
  generateFlashcardCandidates: vi.fn(),
}));

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/flashcards/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeContext(user: { id: string } | null, body: unknown): Parameters<typeof POST>[0] {
  return {
    locals: { user },
    request: makeRequest(body),
  } as unknown as Parameters<typeof POST>[0];
}

const AUTHENTICATED_USER = { id: "user-1" };
const VALID_TEXT = "This is a study text long enough to pass the minimum length validation check.";

describe("POST /api/flashcards/generate", () => {
  afterEach(() => {
    vi.mocked(generateFlashcardCandidates).mockReset();
  });

  it("returns 401 when there is no authenticated user", async () => {
    const response = await POST(makeContext(null, { text: VALID_TEXT }));

    expect(response.status).toBe(401);
    expect(generateFlashcardCandidates).not.toHaveBeenCalled();
  });

  it("returns 400 validation_error for an invalid JSON body", async () => {
    const response = await POST({
      locals: { user: AUTHENTICATED_USER },
      request: new Request("http://localhost/api/flashcards/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not valid json",
      }),
    } as unknown as Parameters<typeof POST>[0]);

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 400 validation_error when text is missing or not a string", async () => {
    const response = await POST(makeContext(AUTHENTICATED_USER, {}));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 400 validation_error when text is under the minimum length", async () => {
    const response = await POST(makeContext(AUTHENTICATED_USER, { text: "too short" }));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 400 validation_error when text exceeds the maximum length", async () => {
    const response = await POST(makeContext(AUTHENTICATED_USER, { text: "a".repeat(10001) }));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 502 with the service's error when generateFlashcardCandidates fails", async () => {
    const serviceError = {
      code: "generation_failed",
      message: "We couldn't generate flashcards right now. Please try again.",
    };
    vi.mocked(generateFlashcardCandidates).mockResolvedValueOnce({ error: serviceError });

    const response = await POST(makeContext(AUTHENTICATED_USER, { text: VALID_TEXT }));

    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: unknown };
    expect(body.error).toEqual(serviceError);
  });

  it("returns 200 with the service's candidates on success, and forwards the trimmed text", async () => {
    const candidates = [{ question: "Q1", answer: "A1" }];
    vi.mocked(generateFlashcardCandidates).mockResolvedValueOnce({ data: candidates });

    const response = await POST(makeContext(AUTHENTICATED_USER, { text: `  ${VALID_TEXT}  ` }));

    expect(response.status).toBe(200);
    const body = (await response.json()) as { candidates: unknown };
    expect(body.candidates).toEqual(candidates);
    expect(generateFlashcardCandidates).toHaveBeenCalledWith(VALID_TEXT);
  });
});
