import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ServerError } from "@/components/auth/ServerError";
import type { Flashcard, UpdateFlashcardCommand } from "@/types";

const MAX_LENGTH = 2000;

interface Props {
  flashcard: Flashcard;
  onUpdate: (id: string, command: UpdateFlashcardCommand) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function FlashcardListItem({ flashcard, onUpdate, onDelete }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [question, setQuestion] = useState(flashcard.question);
  const [answer, setAnswer] = useState(flashcard.answer);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const questionValid = question.trim().length > 0 && question.trim().length <= MAX_LENGTH;
  const answerValid = answer.trim().length > 0 && answer.trim().length <= MAX_LENGTH;
  const canSave = questionValid && answerValid && !isSubmitting;

  function startEditing() {
    setQuestion(flashcard.question);
    setAnswer(flashcard.answer);
    setError(null);
    setIsEditing(true);
  }

  function cancelEditing() {
    setIsEditing(false);
    setError(null);
  }

  async function handleSave() {
    if (!canSave) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await onUpdate(flashcard.id, { question: question.trim(), answer: answer.trim() });
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    setError(null);
    setIsSubmitting(true);
    try {
      await onDelete(flashcard.id);
      setDialogOpen(false);
    } catch (err) {
      setDialogOpen(false);
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isEditing) {
    return (
      <div className="space-y-3 rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-xl">
        <Textarea
          value={question}
          onChange={(event) => {
            setQuestion(event.target.value);
          }}
          className="border-white/20 bg-white/10 text-white placeholder-white/40 focus-visible:ring-purple-400"
        />
        <Textarea
          value={answer}
          onChange={(event) => {
            setAnswer(event.target.value);
          }}
          className="border-white/20 bg-white/10 text-white placeholder-white/40 focus-visible:ring-purple-400"
        />
        <ServerError message={error} />
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500"
          >
            {isSubmitting ? "Saving..." : "Save"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={cancelEditing}
            disabled={isSubmitting}
            className="rounded-lg border-white/20 bg-transparent px-4 py-2 text-sm text-white hover:bg-white/10"
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-xl">
      <p className="font-medium text-white">{flashcard.question}</p>
      <p className="text-sm text-blue-100/70">{flashcard.answer}</p>
      <ServerError message={error} />
      <div className="flex gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          onClick={startEditing}
          className="rounded-lg border-white/20 bg-transparent px-3 py-1 text-xs text-white hover:bg-white/10"
        >
          Edit
        </Button>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="rounded-lg border-red-400/30 bg-transparent px-3 py-1 text-xs text-red-300 hover:bg-red-900/30"
            >
              Delete
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete this flashcard?</DialogTitle>
              <DialogDescription>This can&apos;t be undone.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDialogOpen(false);
                }}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={handleDelete} disabled={isSubmitting}>
                {isSubmitting ? "Deleting..." : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
