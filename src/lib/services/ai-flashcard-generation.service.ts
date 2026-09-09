import { OPENROUTER_API_KEY } from "astro:env/server";
import type { FlashcardCandidate, ServiceError } from "@/types";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
// Cheap/fast tier per plan decision — verify this still resolves on OpenRouter and
// supports `response_format: json_schema` before relying on it (see plan.md Phase 1).
const OPENROUTER_MODEL = "openai/gpt-4o-mini";
const MAX_CANDIDATES = 20;
const MAX_FIELD_LENGTH = 2000;
const REQUEST_TIMEOUT_MS = 20000;

const GENERATION_FAILED_ERROR: ServiceError = {
  code: "generation_failed",
  message: "We couldn't generate flashcards right now. Please try again.",
};

const SYSTEM_PROMPT = `You are a flashcard-generation assistant for a spaced-repetition study app.
Given a block of study text, extract the discrete facts or concepts it contains and turn each one into
a standalone question/answer flashcard pair suitable for spaced-repetition review. Generate between 0 and
${MAX_CANDIDATES} candidates depending on how many distinct facts the text actually contains — do not pad
the count or invent facts that aren't in the text. If the text contains no extractable facts, return an
empty candidates array.`;

const RESPONSE_JSON_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "flashcard_candidates",
    strict: true,
    schema: {
      type: "object",
      properties: {
        candidates: {
          type: "array",
          maxItems: MAX_CANDIDATES,
          items: {
            type: "object",
            properties: {
              question: { type: "string" },
              answer: { type: "string" },
            },
            required: ["question", "answer"],
            additionalProperties: false,
          },
        },
      },
      required: ["candidates"],
      additionalProperties: false,
    },
  },
} as const;

interface OpenRouterResponseBody {
  choices?: { message?: { content?: string } }[];
}

interface ParsedCandidates {
  candidates?: unknown;
}

export async function generateFlashcardCandidates(
  text: string,
): Promise<{ data: FlashcardCandidate[] } | { error: ServiceError }> {
  if (!OPENROUTER_API_KEY) {
    console.error("[ai-flashcard-generation.service] OPENROUTER_API_KEY is not configured");
    return { error: GENERATION_FAILED_ERROR };
  }

  let response: Response;
  try {
    response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text },
        ],
        response_format: RESPONSE_JSON_SCHEMA,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    console.error("[ai-flashcard-generation.service] network error or timeout", error);
    return { error: GENERATION_FAILED_ERROR };
  }

  if (!response.ok) {
    console.error(
      "[ai-flashcard-generation.service] OpenRouter returned",
      response.status,
      await safeReadText(response),
    );
    return { error: GENERATION_FAILED_ERROR };
  }

  let body: OpenRouterResponseBody;
  try {
    body = (await response.json()) as OpenRouterResponseBody;
  } catch (error) {
    console.error("[ai-flashcard-generation.service] invalid JSON response envelope", error);
    return { error: GENERATION_FAILED_ERROR };
  }

  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    console.error("[ai-flashcard-generation.service] missing message content", body);
    return { error: GENERATION_FAILED_ERROR };
  }

  let parsed: ParsedCandidates;
  try {
    parsed = JSON.parse(content) as ParsedCandidates;
  } catch (error) {
    console.error("[ai-flashcard-generation.service] unparseable model output", error);
    return { error: GENERATION_FAILED_ERROR };
  }

  if (!Array.isArray(parsed.candidates)) {
    console.error("[ai-flashcard-generation.service] malformed candidates shape", parsed);
    return { error: GENERATION_FAILED_ERROR };
  }

  const candidates = parsed.candidates
    .slice(0, MAX_CANDIDATES)
    .filter(isValidCandidate)
    .map((candidate) => ({ question: candidate.question.trim(), answer: candidate.answer.trim() }));

  return { data: candidates };
}

function isValidCandidate(value: unknown): value is FlashcardCandidate {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.question === "string" &&
    candidate.question.trim().length > 0 &&
    candidate.question.trim().length <= MAX_FIELD_LENGTH &&
    typeof candidate.answer === "string" &&
    candidate.answer.trim().length > 0 &&
    candidate.answer.trim().length <= MAX_FIELD_LENGTH
  );
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "<unreadable body>";
  }
}
