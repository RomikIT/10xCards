import { afterEach, describe, expect, it, vi } from "vitest";
import type { AstroCookies } from "astro";
import { createClient } from "@/lib/supabase";
import { POST } from "../index";
import { createFakeSupabaseClient } from "./helpers/fake-supabase";

// Vitest hoists vi.mock() above these imports, so `POST` (which imports
// createClient internally) closes over the mocked version.
vi.mock("@/lib/supabase", () => ({
  createClient: vi.fn(),
}));

function makeRequest(body: string): Request {
  return new Request("http://localhost/api/flashcards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

function makeContext(user: { id: string } | null, body: string): Parameters<typeof POST>[0] {
  return {
    locals: { user },
    request: makeRequest(body),
    cookies: {} as AstroCookies,
  } as unknown as Parameters<typeof POST>[0];
}

const AUTHENTICATED_USER = { id: "user-1" };
const VALID_BODY = JSON.stringify({ question: "What is Vitest?", answer: "A Vite-native test runner." });

describe("POST /api/flashcards", () => {
  afterEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it("returns 401 when there is no authenticated user", async () => {
    const response = await POST(makeContext(null, VALID_BODY));

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("unauthorized");
  });

  it("returns 500 internal_error when createClient returns null", async () => {
    vi.mocked(createClient).mockReturnValue(null);

    const response = await POST(makeContext(AUTHENTICATED_USER, VALID_BODY));

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("internal_error");
  });

  it("returns 400 validation_error for an invalid JSON body", async () => {
    const { client } = createFakeSupabaseClient();
    vi.mocked(createClient).mockReturnValue(client);

    const response = await POST(makeContext(AUTHENTICATED_USER, "not valid json"));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 400 validation_error when question/answer fail the length check", async () => {
    const { client } = createFakeSupabaseClient();
    vi.mocked(createClient).mockReturnValue(client);

    const response = await POST(makeContext(AUTHENTICATED_USER, JSON.stringify({ question: "", answer: "" })));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 201 with the persisted flashcard on valid input", async () => {
    const { client } = createFakeSupabaseClient();
    vi.mocked(createClient).mockReturnValue(client);

    const response = await POST(makeContext(AUTHENTICATED_USER, VALID_BODY));

    expect(response.status).toBe(201);
    const body = (await response.json()) as { flashcard: { question: string; answer: string } };
    expect(body.flashcard.question).toBe("What is Vitest?");
    expect(body.flashcard.answer).toBe("A Vite-native test runner.");
  });

  // Risk #1 priority case (research.md "Risk #1" verdict, test-plan.md §2 Risk
  // Response Guidance #1): this documents today's behavior — the endpoint has
  // no server-side duplicate-save protection — it is not asserting that this
  // SHOULD be rejected. See plan.md Phase 3 "What We're NOT Doing": a fix
  // (unique constraint / idempotency key) is a deliberate, separate decision.
  it("[documents a known gap] two sequential identical POSTs both succeed and persist two rows", async () => {
    const { client, insertCalls, rows } = createFakeSupabaseClient();
    vi.mocked(createClient).mockReturnValue(client);

    const first = await POST(makeContext(AUTHENTICATED_USER, VALID_BODY));
    const second = await POST(makeContext(AUTHENTICATED_USER, VALID_BODY));

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(insertCalls).toHaveLength(2);
    expect(rows).toHaveLength(2);
    expect(rows[0].id).not.toBe(rows[1].id);
  });
});
