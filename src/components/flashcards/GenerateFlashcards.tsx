import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/auth/ServerError";
import { CandidateCard } from "@/components/flashcards/CandidateCard";
import type { FlashcardCandidate, GenerateFlashcardsCommand } from "@/types";

const MIN_LENGTH = 20;
const MAX_LENGTH = 10000;

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

interface CandidateWithId extends FlashcardCandidate {
  id: string;
}

export function GenerateFlashcards() {
  const [text, setText] = useState("");
  const [candidates, setCandidates] = useState<CandidateWithId[]>([]);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedLength = text.trim().length;
  const textValid = trimmedLength >= MIN_LENGTH && trimmedLength <= MAX_LENGTH;
  const canGenerate = textValid && !isGenerating;

  async function handleGenerate() {
    if (!canGenerate) return;
    setError(null);
    setIsGenerating(true);
    try {
      const command: GenerateFlashcardsCommand = { text: text.trim() };
      const response = await fetch("/api/flashcards/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      if (!response.ok) {
        throw new Error(await extractErrorMessage(response));
      }
      const body = (await response.json()) as { candidates: FlashcardCandidate[] };
      setCandidates(body.candidates.map((candidate) => ({ ...candidate, id: crypto.randomUUID() })));
      setHasGenerated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  function removeCandidate(id: string) {
    setCandidates((prev) => prev.filter((candidate) => candidate.id !== id));
  }

  return (
    <div>
      <div className="mb-6 space-y-4 rounded-2xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl">
        <h2 className="text-lg font-semibold text-white">Paste your study text</h2>
        <Textarea
          value={text}
          onChange={(event) => {
            setText(event.target.value);
          }}
          placeholder="Paste a block of study text (notes, guide, textbook excerpt)…"
          rows={8}
          className="border-white/20 bg-white/10 text-white placeholder-white/40 focus-visible:ring-purple-400"
        />
        <p className="text-xs text-blue-100/50">
          {trimmedLength} / {MAX_LENGTH} characters (minimum {MIN_LENGTH})
        </p>
        <ServerError message={error} />
        <Button
          type="button"
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="w-full rounded-lg bg-purple-600 px-4 py-2 font-medium text-white transition-colors hover:bg-purple-500"
        >
          {isGenerating ? "Generating flashcards..." : "Generate flashcards"}
        </Button>
      </div>

      {hasGenerated && candidates.length === 0 && (
        <p className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-sm text-blue-100/70">
          No flashcards could be generated from this text — try different or more detailed study material.
        </p>
      )}

      {candidates.length > 0 && (
        <div className="space-y-3">
          {candidates.map((candidate) => (
            <CandidateCard
              key={candidate.id}
              candidate={candidate}
              onAccepted={() => {
                removeCandidate(candidate.id);
              }}
              onRejected={() => {
                removeCandidate(candidate.id);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
