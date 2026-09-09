-- Minimal flashcards table (roadmap F-01): question, answer, owner user_id,
-- timestamps. No spaced-repetition scheduling columns yet — those land in
-- F-02 once the SRS library is chosen.

create table public.flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  question text not null,
  answer text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flashcards_question_length check (char_length(trim(question)) between 1 and 2000),
  constraint flashcards_answer_length check (char_length(trim(answer)) between 1 and 2000)
);

create index flashcards_user_id_idx on public.flashcards (user_id);

-- Generic, reusable updated_at trigger function — not flashcards-specific,
-- so future tables (F-02 extends this one; later slices may add more) can
-- reuse it without a duplicate migration.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at = now();
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create trigger flashcards_set_updated_at
  before insert or update on public.flashcards
  for each row
  execute function public.set_updated_at();

alter table public.flashcards enable row level security;

-- Granular per-operation, per-role policies (CLAUDE.md convention) rather
-- than a single blanket FOR ALL policy — each user may only touch their own
-- rows.
create policy flashcards_select_own
  on public.flashcards
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy flashcards_insert_own
  on public.flashcards
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy flashcards_update_own
  on public.flashcards
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy flashcards_delete_own
  on public.flashcards
  for delete
  to authenticated
  using (auth.uid() = user_id);
