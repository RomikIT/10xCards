export interface Flashcard {
  id: string;
  user_id: string;
  question: string;
  answer: string;
  created_at: string;
  updated_at: string;
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
