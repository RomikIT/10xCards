import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { createFlashcard, listFlashcards } from "@/lib/services/flashcards.service";
import type { CreateFlashcardCommand } from "@/types";

const MAX_LENGTH = 2000;

export const GET: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: { code: "unauthorized", message: "You must be signed in." } }, { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json(
      { error: { code: "internal_error", message: "Something went wrong. Please try again." } },
      { status: 500 },
    );
  }

  const result = await listFlashcards(supabase);
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 500 });
  }

  return Response.json({ flashcards: result.data }, { status: 200 });
};

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: { code: "unauthorized", message: "You must be signed in." } }, { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json(
      { error: { code: "internal_error", message: "Something went wrong. Please try again." } },
      { status: 500 },
    );
  }

  let body: Partial<CreateFlashcardCommand>;
  try {
    body = (await context.request.json()) as Partial<CreateFlashcardCommand>;
  } catch {
    return Response.json({ error: { code: "validation_error", message: "Invalid request body." } }, { status: 400 });
  }
  if (
    typeof body.question !== "string" ||
    !body.question.trim() ||
    body.question.trim().length > MAX_LENGTH ||
    typeof body.answer !== "string" ||
    !body.answer.trim() ||
    body.answer.trim().length > MAX_LENGTH
  ) {
    return Response.json(
      { error: { code: "validation_error", message: "Question and answer must be between 1 and 2000 characters." } },
      { status: 400 },
    );
  }

  const result = await createFlashcard(supabase, context.locals.user.id, {
    question: body.question,
    answer: body.answer,
  });

  if ("error" in result) {
    const status = result.error.code === "validation_error" ? 400 : 500;
    return Response.json({ error: result.error }, { status });
  }

  return Response.json({ flashcard: result.data }, { status: 201 });
};
