-- Extend flashcards (roadmap S-04) with FSRS (ts-fsrs) scheduling state.
-- Purely additive — column defaults mirror ts-fsrs's createEmptyCard() output
-- (state = New, due = now) so both pre-existing and newly-created rows are
-- immediately eligible for review. RLS is row-scoped, not column-scoped, so
-- the existing 4 per-operation policies already cover these new columns.

alter table public.flashcards
  add column due timestamptz not null default now(),
  add column stability numeric not null default 0,
  add column difficulty numeric not null default 0,
  add column state smallint not null default 0, -- 0=New, 1=Learning, 2=Review, 3=Relearning (ts-fsrs State enum)
  add column reps integer not null default 0,
  add column lapses integer not null default 0,
  add column scheduled_days integer not null default 0,
  add column learning_steps integer not null default 0,
  add column last_review timestamptz null default null;

create index flashcards_user_due_idx on public.flashcards (user_id, due);
