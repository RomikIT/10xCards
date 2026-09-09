import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateFlashcardCommand, Flashcard, ServiceError, UpdateFlashcardCommand } from "@/types";

const VALIDATION_ERROR_MESSAGE = "Question and answer must be between 1 and 2000 characters.";
const INTERNAL_ERROR_MESSAGE = "Something went wrong. Please try again.";

function mapError(error: { code?: string; message?: string }): ServiceError {
  if (error.code === "23514") {
    return { code: "validation_error", message: VALIDATION_ERROR_MESSAGE };
  }
  console.error("[flashcards.service]", error);
  return { code: "internal_error", message: INTERNAL_ERROR_MESSAGE };
}

export async function listFlashcards(
  supabase: SupabaseClient,
): Promise<{ data: Flashcard[] } | { error: ServiceError }> {
  const { data, error } = await supabase.from("flashcards").select("*").order("created_at", { ascending: false });

  if (error) {
    return { error: mapError(error) };
  }

  return { data: data as Flashcard[] };
}

export async function createFlashcard(
  supabase: SupabaseClient,
  userId: string,
  command: CreateFlashcardCommand,
): Promise<{ data: Flashcard } | { error: ServiceError }> {
  const response = await supabase
    .from("flashcards")
    .insert({ user_id: userId, question: command.question, answer: command.answer })
    .select()
    .single();

  if (response.error) {
    return { error: mapError(response.error) };
  }

  return { data: response.data as Flashcard };
}

export async function updateFlashcard(
  supabase: SupabaseClient,
  id: string,
  command: UpdateFlashcardCommand,
): Promise<{ data: Flashcard } | { notFound: true } | { error: ServiceError }> {
  const { data, error } = await supabase
    .from("flashcards")
    .update({ question: command.question, answer: command.answer })
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

export async function deleteFlashcard(
  supabase: SupabaseClient,
  id: string,
): Promise<{ ok: true } | { notFound: true } | { error: ServiceError }> {
  const { data, error } = await supabase.from("flashcards").delete().eq("id", id).select();

  if (error) {
    return { error: mapError(error) };
  }

  if (data.length === 0) {
    return { notFound: true };
  }

  return { ok: true };
}
