import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/auth/ServerError";
import type { CreateFlashcardCommand, FlashcardCandidate } from "@/types";

const MAX_LENGTH = 2000;

interface Props {
  candidate: FlashcardCandidate;
  onAccepted: () => void;
  onRejected: () => void;
}

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

export function CandidateCard({ candidate, onAccepted, onRejected }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [question, setQuestion] = useState(candidate.question);
  const [answer, setAnswer] = useState(candidate.answer);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const questionValid = question.trim().length > 0 && question.trim().length <= MAX_LENGTH;
  const answerValid = answer.trim().length > 0 && answer.trim().length <= MAX_LENGTH;
  const canAccept = questionValid && answerValid && !isSubmitting;

  function startEditing() {
    setError(null);
    setIsEditing(true);
  }

  function cancelEditing() {
    setQuestion(candidate.question);
    setAnswer(candidate.answer);
    setError(null);
    setIsEditing(false);
  }

  async function handleAccept() {
    if (!canAccept) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const command: CreateFlashcardCommand = { question: question.trim(), answer: answer.trim() };
      const response = await fetch("/api/flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      if (!response.ok) {
        throw new Error(await extractErrorMessage(response));
      }
      onAccepted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleReject() {
    onRejected();
  }

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-xl">
      {isEditing ? (
        <>
          <Textarea
            aria-label="Question"
            value={question}
            onChange={(event) => {
              setQuestion(event.target.value);
            }}
            className="border-white/20 bg-white/10 text-white placeholder-white/40 focus-visible:ring-purple-400"
          />
          <Textarea
            aria-label="Answer"
            value={answer}
            onChange={(event) => {
              setAnswer(event.target.value);
            }}
            className="border-white/20 bg-white/10 text-white placeholder-white/40 focus-visible:ring-purple-400"
          />
        </>
      ) : (
        <>
          <p className="font-medium text-white">{question}</p>
          <p className="text-sm text-blue-100/70">{answer}</p>
        </>
      )}

      <ServerError message={error} />

      <div className="flex gap-2 pt-1">
        <Button
          type="button"
          onClick={handleAccept}
          disabled={!canAccept}
          className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500"
        >
          {isSubmitting ? "Saving..." : "Accept"}
        </Button>
        {isEditing ? (
          <Button
            type="button"
            variant="outline"
            onClick={cancelEditing}
            disabled={isSubmitting}
            className="rounded-lg border-white/20 bg-transparent px-4 py-2 text-sm text-white hover:bg-white/10"
          >
            Cancel
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={startEditing}
            disabled={isSubmitting}
            className="rounded-lg border-white/20 bg-transparent px-4 py-2 text-sm text-white hover:bg-white/10"
          >
            Edit
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={handleReject}
          disabled={isSubmitting}
          className="rounded-lg border-red-400/30 bg-transparent px-4 py-2 text-sm text-red-300 hover:bg-red-900/30"
        >
          Reject
        </Button>
      </div>
    </div>
  );
}
