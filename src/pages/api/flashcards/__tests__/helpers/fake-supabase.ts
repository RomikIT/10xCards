import type { SupabaseClient } from "@supabase/supabase-js";
import type { Flashcard } from "@/types";

interface InsertRow {
  user_id: string;
  question: string;
  answer: string;
}

/**
 * Minimal, call-counting stand-in for the single Supabase chain the POST
 * /api/flashcards route actually exercises: `.from("flashcards").insert(row).select().single()`.
 * Not a general-purpose Supabase mock — only what createFlashcard touches
 * (src/lib/services/flashcards.service.ts:32-36). Backed by an in-memory array
 * so Phase 3's duplicate-save regression test can observe insert count and
 * resulting row count directly, per research.md's Risk #1 finding that no
 * unique constraint exists to prevent this at the real DB layer either.
 */
export function createFakeSupabaseClient() {
  const rows: Flashcard[] = [];
  const insertCalls: InsertRow[] = [];
  let nextId = 0;

  const client = {
    from() {
      return {
        insert(row: InsertRow) {
          insertCalls.push(row);
          return {
            select() {
              return {
                single() {
                  nextId += 1;
                  const now = new Date().toISOString();
                  const flashcard = {
                    id: `fake-flashcard-${nextId}`,
                    user_id: row.user_id,
                    question: row.question,
                    answer: row.answer,
                    created_at: now,
                    updated_at: now,
                  } as Flashcard;
                  rows.push(flashcard);
                  return { data: flashcard, error: null };
                },
              };
            },
          };
        },
      };
    },
  };

  return {
    client: client as unknown as SupabaseClient,
    rows,
    insertCalls,
  };
}
