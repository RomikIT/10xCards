import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { deleteFlashcard, updateFlashcard } from "@/lib/services/flashcards.service";
import type { UpdateFlashcardCommand } from "@/types";

export const PATCH: APIRoute = async (context) => {
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

  const id = context.params.id;
  if (!id) {
    return Response.json({ error: { code: "not_found", message: "Flashcard not found." } }, { status: 404 });
  }

  const body = (await context.request.json()) as Partial<UpdateFlashcardCommand>;
  if (
    typeof body.question !== "string" ||
    !body.question.trim() ||
    typeof body.answer !== "string" ||
    !body.answer.trim()
  ) {
    return Response.json(
      { error: { code: "validation_error", message: "Question and answer must be between 1 and 2000 characters." } },
      { status: 400 },
    );
  }

  const result = await updateFlashcard(supabase, id, {
    question: body.question,
    answer: body.answer,
  });

  if ("notFound" in result) {
    return Response.json({ error: { code: "not_found", message: "Flashcard not found." } }, { status: 404 });
  }
  if ("error" in result) {
    const status = result.error.code === "validation_error" ? 400 : 500;
    return Response.json({ error: result.error }, { status });
  }

  return Response.json({ flashcard: result.data }, { status: 200 });
};

export const DELETE: APIRoute = async (context) => {
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

  const id = context.params.id;
  if (!id) {
    return Response.json({ error: { code: "not_found", message: "Flashcard not found." } }, { status: 404 });
  }

  const result = await deleteFlashcard(supabase, id);

  if ("notFound" in result) {
    return Response.json({ error: { code: "not_found", message: "Flashcard not found." } }, { status: 404 });
  }
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 500 });
  }

  return new Response(null, { status: 204 });
};
