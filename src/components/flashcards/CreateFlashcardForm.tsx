import { useState, type SubmitEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/auth/ServerError";
import type { CreateFlashcardCommand } from "@/types";

const MAX_LENGTH = 2000;

interface Props {
  onCreate: (command: CreateFlashcardCommand) => Promise<void>;
}

export function CreateFlashcardForm({ onCreate }: Props) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const questionValid = question.trim().length > 0 && question.trim().length <= MAX_LENGTH;
  const answerValid = answer.trim().length > 0 && answer.trim().length <= MAX_LENGTH;
  const canSubmit = questionValid && answerValid && !isSubmitting;

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setError(null);
    setIsSubmitting(true);
    try {
      await onCreate({ question: question.trim(), answer: answer.trim() });
      setQuestion("");
      setAnswer("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 space-y-4 rounded-2xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl"
      noValidate
    >
      <h2 className="text-lg font-semibold text-white">Add a flashcard</h2>

      <div>
        <label htmlFor="question" className="mb-1 block text-sm text-blue-100/80">
          Question
        </label>
        <Textarea
          id="question"
          value={question}
          onChange={(event) => {
            setQuestion(event.target.value);
          }}
          placeholder="What do you want to remember?"
          className="border-white/20 bg-white/10 text-white placeholder-white/40 focus-visible:ring-purple-400"
        />
        <p className="mt-1 text-xs text-blue-100/50">
          {question.trim().length} / {MAX_LENGTH}
        </p>
      </div>

      <div>
        <label htmlFor="answer" className="mb-1 block text-sm text-blue-100/80">
          Answer
        </label>
        <Textarea
          id="answer"
          value={answer}
          onChange={(event) => {
            setAnswer(event.target.value);
          }}
          placeholder="The answer"
          className="border-white/20 bg-white/10 text-white placeholder-white/40 focus-visible:ring-purple-400"
        />
        <p className="mt-1 text-xs text-blue-100/50">
          {answer.trim().length} / {MAX_LENGTH}
        </p>
      </div>

      <ServerError message={error} />

      <Button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-lg bg-purple-600 px-4 py-2 font-medium text-white transition-colors hover:bg-purple-500"
      >
        {isSubmitting ? "Creating..." : "Add flashcard"}
      </Button>
    </form>
  );
}
