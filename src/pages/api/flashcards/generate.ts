import type { APIRoute } from "astro";
import { generateFlashcardCandidates } from "@/lib/services/ai-flashcard-generation.service";
import type { GenerateFlashcardsCommand } from "@/types";

const MIN_INPUT_LENGTH = 20;
const MAX_INPUT_LENGTH = 10000;

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: { code: "unauthorized", message: "You must be signed in." } }, { status: 401 });
  }

  let body: Partial<GenerateFlashcardsCommand>;
  try {
    body = (await context.request.json()) as Partial<GenerateFlashcardsCommand>;
  } catch {
    return Response.json({ error: { code: "validation_error", message: "Invalid request body." } }, { status: 400 });
  }

  if (typeof body.text !== "string" || body.text.trim().length < MIN_INPUT_LENGTH) {
    return Response.json(
      {
        error: {
          code: "validation_error",
          message: `Please paste at least ${MIN_INPUT_LENGTH} characters of study text.`,
        },
      },
      { status: 400 },
    );
  }

  if (body.text.trim().length > MAX_INPUT_LENGTH) {
    return Response.json(
      {
        error: {
          code: "validation_error",
          message: `Please paste no more than ${MAX_INPUT_LENGTH.toLocaleString("en-US")} characters of study text.`,
        },
      },
      { status: 400 },
    );
  }

  const result = await generateFlashcardCandidates(body.text);

  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 502 });
  }

  return Response.json({ candidates: result.data }, { status: 200 });
};
