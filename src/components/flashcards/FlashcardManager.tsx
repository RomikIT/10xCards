import { useState } from "react";
import { ServerError } from "@/components/auth/ServerError";
import { CreateFlashcardForm } from "@/components/flashcards/CreateFlashcardForm";
import { FlashcardListItem } from "@/components/flashcards/FlashcardListItem";
import type { CreateFlashcardCommand, Flashcard, UpdateFlashcardCommand } from "@/types";

interface ApiErrorBody {
  error?: { message?: string };
}

async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return body.error?.message ?? "Something went wrong. Please try again.";
  } catch {
    return "Something went wrong. Please try again.";
  }
}

interface Props {
  initialFlashcards: Flashcard[];
  initialError?: string | null;
}

export function FlashcardManager({ initialFlashcards, initialError }: Props) {
  const [flashcards, setFlashcards] = useState<Flashcard[]>(initialFlashcards);

  async function handleCreate(command: CreateFlashcardCommand) {
    const response = await fetch("/api/flashcards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(command),
    });
    if (!response.ok) {
      throw new Error(await extractErrorMessage(response));
    }
    const body = (await response.json()) as { flashcard: Flashcard };
    setFlashcards((prev) => [body.flashcard, ...prev]);
  }

  async function handleUpdate(id: string, command: UpdateFlashcardCommand) {
    const response = await fetch(`/api/flashcards/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(command),
    });
    if (!response.ok) {
      throw new Error(await extractErrorMessage(response));
    }
    const body = (await response.json()) as { flashcard: Flashcard };
    setFlashcards((prev) => prev.map((flashcard) => (flashcard.id === id ? body.flashcard : flashcard)));
  }

  async function handleDelete(id: string) {
    const response = await fetch(`/api/flashcards/${id}`, { method: "DELETE" });
    if (!response.ok) {
      throw new Error(await extractErrorMessage(response));
    }
    setFlashcards((prev) => prev.filter((flashcard) => flashcard.id !== id));
  }

  return (
    <div>
      <ServerError message={initialError} />
      <CreateFlashcardForm onCreate={handleCreate} />
      {flashcards.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-sm text-blue-100/70">
          You don&apos;t have any flashcards yet — add your first one above.
        </p>
      ) : (
        <div className="space-y-3">
          {flashcards.map((flashcard) => (
            <FlashcardListItem
              key={flashcard.id}
              flashcard={flashcard}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
