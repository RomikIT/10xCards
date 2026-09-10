import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { listDueFlashcards } from "@/lib/services/review.service";

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

  const result = await listDueFlashcards(supabase);
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 500 });
  }

  return Response.json({ flashcards: result.data }, { status: 200 });
};
