import type { APIRoute } from "astro";
import { Rating, type Grade } from "ts-fsrs";
import { createClient } from "@/lib/supabase";
import { gradeFlashcardReview } from "@/lib/services/review.service";
import type { GradeReviewCommand } from "@/types";

const GRADE_VALUES: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];

function isGrade(value: unknown): value is Grade {
  return typeof value === "number" && GRADE_VALUES.includes(value);
}

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

  const id = context.params.id;
  if (!id) {
    return Response.json({ error: { code: "not_found", message: "Flashcard not found." } }, { status: 404 });
  }

  let body: Partial<GradeReviewCommand>;
  try {
    body = (await context.request.json()) as Partial<GradeReviewCommand>;
  } catch {
    return Response.json({ error: { code: "validation_error", message: "Invalid request body." } }, { status: 400 });
  }

  if (!isGrade(body.rating)) {
    return Response.json(
      {
        error: {
          code: "validation_error",
          message: "Rating must be one of: Again, Hard, Good, Easy.",
        },
      },
      { status: 400 },
    );
  }

  const result = await gradeFlashcardReview(supabase, id, body.rating);

  if ("notFound" in result) {
    return Response.json({ error: { code: "not_found", message: "Flashcard not found." } }, { status: 404 });
  }
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 500 });
  }

  return Response.json({ flashcard: result.data }, { status: 200 });
};
