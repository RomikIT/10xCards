import type { SupabaseClient } from "@supabase/supabase-js";
import { fsrs, TypeConvert, type Card, type Grade } from "ts-fsrs";
import { formatDate } from "@/lib/utils";
import type { Flashcard, ServiceError } from "@/types";

const VALIDATION_ERROR_MESSAGE = "Question and answer must be between 1 and 2000 characters.";
const INTERNAL_ERROR_MESSAGE = "Something went wrong. Please try again.";

function mapError(error: { code?: string; message?: string }): ServiceError {
  if (error.code === "23514") {
    return { code: "validation_error", message: VALIDATION_ERROR_MESSAGE };
  }
  console.error("[review.service]", error);
  return { code: "internal_error", message: INTERNAL_ERROR_MESSAGE };
}

function toCard(flashcard: Flashcard): Card {
  return TypeConvert.card({
    due: flashcard.due,
    stability: flashcard.stability,
    difficulty: flashcard.difficulty,
    elapsed_days: 0, // deprecated in ts-fsrs, not persisted — TypeConvert.card() requires it on the input shape
    scheduled_days: flashcard.scheduled_days,
    learning_steps: flashcard.learning_steps,
    reps: flashcard.reps,
    lapses: flashcard.lapses,
    state: flashcard.state,
    last_review: flashcard.last_review,
  });
}

export async function listDueFlashcards(
  supabase: SupabaseClient,
): Promise<{ data: Flashcard[] } | { error: ServiceError }> {
  const { data, error } = await supabase
    .from("flashcards")
    .select("*")
    .lte("due", formatDate(new Date()))
    .order("due", { ascending: true });

  if (error) {
    return { error: mapError(error) };
  }

  return { data: data as Flashcard[] };
}

export async function gradeFlashcardReview(
  supabase: SupabaseClient,
  id: string,
  rating: Grade,
): Promise<{ data: Flashcard } | { notFound: true } | { error: ServiceError }> {
  const { data: existing, error: fetchError } = await supabase.from("flashcards").select("*").eq("id", id);

  if (fetchError) {
    return { error: mapError(fetchError) };
  }
  if (existing.length === 0) {
    return { notFound: true };
  }

  const { card: updatedCard } = fsrs().next(toCard(existing[0] as Flashcard), new Date(), rating);

  const { data, error } = await supabase
    .from("flashcards")
    .update({
      due: formatDate(updatedCard.due),
      stability: updatedCard.stability,
      difficulty: updatedCard.difficulty,
      state: updatedCard.state,
      reps: updatedCard.reps,
      lapses: updatedCard.lapses,
      scheduled_days: updatedCard.scheduled_days,
      learning_steps: updatedCard.learning_steps,
      last_review: updatedCard.last_review ? formatDate(updatedCard.last_review) : null,
    })
    .eq("id", id)
    .select();

  if (error) {
    return { error: mapError(error) };
  }
  if (data.length === 0) {
    return { notFound: true };
  }

  return { data: data[0] as Flashcard };
}
