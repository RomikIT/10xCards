import type { Rating } from "ts-fsrs";

export interface Flashcard {
  id: string;
  user_id: string;
  question: string;
  answer: string;
  created_at: string;
  updated_at: string;
  due: string;
  stability: number;
  difficulty: number;
  state: number;
  reps: number;
  lapses: number;
  scheduled_days: number;
  learning_steps: number;
  last_review: string | null;
}

export interface CreateFlashcardCommand {
  question: string;
  answer: string;
}

export interface UpdateFlashcardCommand {
  question: string;
  answer: string;
}

export interface ServiceError {
  code: string;
  message: string;
}

export interface FlashcardCandidate {
  question: string;
  answer: string;
}

export interface GenerateFlashcardsCommand {
  text: string;
}

export interface GradeReviewCommand {
  rating: Rating;
}
