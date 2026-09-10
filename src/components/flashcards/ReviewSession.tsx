import { useState } from "react";
import { Rating } from "ts-fsrs";
import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/auth/ServerError";
import type { Flashcard } from "@/types";

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

const RATING_BUTTONS: { rating: Rating; label: string }[] = [
  { rating: Rating.Again, label: "Again" },
  { rating: Rating.Hard, label: "Hard" },
  { rating: Rating.Good, label: "Good" },
  { rating: Rating.Easy, label: "Easy" },
];

interface Props {
  initialQueue: Flashcard[];
  initialError?: string | null;
}

export function ReviewSession({ initialQueue, initialError }: Props) {
  const [queue, setQueue] = useState<Flashcard[]>(initialQueue);
  const [answerRevealed, setAnswerRevealed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);

  const current = queue[0];

  async function handleGrade(rating: Rating) {
    if (queue.length === 0 || isSubmitting) return;

    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/flashcards/${current.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating }),
      });
      if (!response.ok) {
        throw new Error(await extractErrorMessage(response));
      }
      setQueue((prev) => prev.slice(1));
      setAnswerRevealed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (queue.length === 0) {
    return (
      <div className="space-y-4">
        <ServerError message={error} />
        <div className="rounded-2xl border border-white/10 bg-white/10 p-8 text-center backdrop-blur-xl">
          <p className="text-lg font-medium text-white">You&apos;re all caught up!</p>
          <p className="mt-2 text-sm text-blue-100/70">No flashcards are due for review right now.</p>
          <a
            href="/flashcards"
            className="mt-6 inline-block rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500"
          >
            Back to your flashcards
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-blue-100/50">{queue.length} card(s) left in this session</p>
      <div className="space-y-4 rounded-2xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl">
        <p className="font-medium text-white">{current.question}</p>
        {answerRevealed ? (
          <p className="text-sm text-blue-100/70">{current.answer}</p>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setAnswerRevealed(true);
            }}
            className="rounded-lg border-white/20 bg-transparent px-4 py-2 text-sm text-white hover:bg-white/10"
          >
            Show answer
          </Button>
        )}
      </div>

      <ServerError message={error} />

      {answerRevealed && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {RATING_BUTTONS.map(({ rating, label }) => (
            <Button
              key={rating}
              type="button"
              disabled={isSubmitting}
              onClick={() => handleGrade(rating)}
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500"
            >
              {label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
