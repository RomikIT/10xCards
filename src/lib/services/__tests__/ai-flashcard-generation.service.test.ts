import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `OPENROUTER_API_KEY` is read from astro:env/server at module top level, so a
// static import would freeze whatever env value existed when this file loaded.
// Each test below stubs the env var and re-imports via vi.resetModules() so the
// module under test observes exactly the env state that test needs — the
// standard Vitest pattern for import-time env reads.
async function loadService(apiKey: string) {
  vi.resetModules();
  vi.stubEnv("OPENROUTER_API_KEY", apiKey);
  return import("@/lib/services/ai-flashcard-generation.service");
}

function fakeResponse(init: { ok: boolean; status?: number; json?: unknown; jsonRejects?: boolean }): Response {
  return {
    ok: init.ok,
    status: init.status ?? (init.ok ? 200 : 500),
    json: () => (init.jsonRejects ? Promise.reject(new Error("invalid envelope JSON")) : Promise.resolve(init.json)),
    text: () => Promise.resolve("<mock body>"),
  } as unknown as Response;
}

// The service's single GENERATION_FAILED_ERROR constant, reused for every
// failure branch (ai-flashcard-generation.service.ts:12-15). Asserting this
// exact, literal contract — not a computed value — locks the current,
// research.md-corrected taxonomy: all OpenRouter-side failures collapse to
// this one shape, there is no separate "invalid key" code.
const GENERATION_FAILED = {
  code: "generation_failed",
  message: "We couldn't generate flashcards right now. Please try again.",
};

describe("generateFlashcardCandidates", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns generation_failed without calling fetch when OPENROUTER_API_KEY is missing", async () => {
    const { generateFlashcardCandidates } = await loadService("");

    const result = await generateFlashcardCandidates("some study text");

    expect(result).toEqual({ error: GENERATION_FAILED });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      "network error / timeout",
      () => {
        fetchMock.mockRejectedValueOnce(new Error("network unreachable"));
      },
    ],
    [
      "non-ok HTTP status (covers both invalid-key 401 and any other rejection)",
      () => {
        fetchMock.mockResolvedValueOnce(fakeResponse({ ok: false, status: 401 }));
      },
    ],
    [
      "invalid envelope JSON",
      () => {
        fetchMock.mockResolvedValueOnce(fakeResponse({ ok: true, jsonRejects: true }));
      },
    ],
    [
      "missing/non-string message content",
      () => {
        fetchMock.mockResolvedValueOnce(fakeResponse({ ok: true, json: { choices: [{ message: {} }] } }));
      },
    ],
    [
      "unparseable inner JSON",
      () => {
        fetchMock.mockResolvedValueOnce(
          fakeResponse({ ok: true, json: { choices: [{ message: { content: "not valid json" } }] } }),
        );
      },
    ],
    [
      "non-array candidates shape",
      () => {
        fetchMock.mockResolvedValueOnce(
          fakeResponse({
            ok: true,
            json: { choices: [{ message: { content: JSON.stringify({ candidates: "nope" }) } }] },
          }),
        );
      },
    ],
  ])("returns the same generation_failed shape for: %s", async (_name, setupFetch) => {
    setupFetch();
    const { generateFlashcardCandidates } = await loadService("test-key");

    const result = await generateFlashcardCandidates("some study text");

    expect(result).toEqual({ error: GENERATION_FAILED });
  });

  it("returns 200-shaped success with an empty array for a legitimate empty result, distinct from a parse failure", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse({ ok: true, json: { choices: [{ message: { content: JSON.stringify({ candidates: [] }) } }] } }),
    );
    const { generateFlashcardCandidates } = await loadService("test-key");

    const result = await generateFlashcardCandidates("text with no extractable facts");

    expect(result).toEqual({ data: [] });
  });
});
