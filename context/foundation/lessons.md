# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Set Supabase Auth's Site URL before trusting a production signup flow

- **Context**: Any project using Supabase Auth's email-confirmation signup flow, verified during the first post-deploy smoke test.
- **Problem**: Supabase's default Auth Site URL (`http://localhost:3000`) isn't updated automatically on deploy — a real user's confirmation-email link redirects to an unreachable local URL instead of the deployed app. Note: the email is actually confirmed server-side by Supabase before the browser redirect fires, so the account is already active despite the broken redirect — but this is easy to misdiagnose as "signup is broken" instead of "one dashboard setting is stale."
- **Rule**: After the first production deploy of a Supabase Auth project, always set Authentication → URL Configuration → Site URL (and the Redirect URLs allowlist) to the production URL, and verify it by actually running the signup → confirm-email → signin flow with a real inbox before considering the deploy done — not just checking that the build/deploy succeeded.
- **Applies to**: plan, implement, impl-review

## E2E: `client:load` React islands need a hydration-safe fill helper, and a write's assertion needs to outlive the real Supabase round-trip

- **Context**: Building the Playwright E2E setup for M3L4 (`tests/e2e/`). Discovered while stabilizing `seed.spec.ts` (create flashcard → survives reload) and `auth.setup.ts` (sign in) — both forms are `client:load` React islands.
- **Problem (two distinct, compounding flakes)**: (1) The SSR-rendered form is editable before React hydrates; a `fill()` issued too early lands on the pre-hydration DOM and gets silently wiped when the controlled component mounts and resets to its initial state — no error, just an empty field a moment later. `page.waitForLoadState("networkidle")` "fixes" the symptom but is explicitly discouraged by this project's own E2E guidance (`browser-driven-generation.md`: "never networkidle or deprecated APIs") and is imprecise. (2) Separately, every API route round-trips to Supabase Cloud for auth (`createClient()` verifies the session on every request) — on a slow/cold connection this can exceed `expect(locator).toBeVisible()`'s default 5s timeout even though the write itself succeeds a moment later, producing a flake that looks identical to a real data-loss bug (the exact shape of the risk the test exists to catch), until you check the actual network response.
- **Rule**: (1) Never `fill()` a `client:load` form field directly in a fresh-navigation test; use a retry-until-stable helper (`tests/e2e/helpers.ts`'s `fillWhenHydrated` — wraps `fill()` + `toHaveValue()` in `expect(...).toPass()`) instead of a blind wait. For a **multi-field** form, use `fillAllWhenHydrated` (fills every field, *then* verifies every field's value together, in that order) instead of calling the single-field helper once per field — a per-field-immediate check can pass and move on, then a later field's fill (or a delayed hydration event) silently wipes an *earlier* field with nothing left to catch it; checking all fields together at the end of each retry attempt catches that. (1b) Even `toHaveValue()` passing isn't proof React's own state saw the update — the DOM value can "stick" while React's event delegation wasn't attached yet, so a derived element (a button's `disabled` state, a character counter) stays wrong forever. Where such a derived signal exists, pass it as `fillWhenHydrated`/`fillAllWhenHydrated`'s optional `confirmReactSaw` callback so a false-positive DOM match still retries with a fresh `fill()`. (2) After any action that triggers a network write your app makes to an external/cloud service (not localhost), `page.waitForResponse(...)` for that specific request **before** asserting on its UI effect — don't let a UI assertion's default timeout double as your network timeout. (3) A single click that opens a Radix (shadcn/ui) `Dialog` occasionally doesn't register the open-state transition — wrap `click trigger → expect(dialog).toBeVisible()` in `expect(async () => {...}).toPass()`, re-clicking the trigger only if the dialog isn't open yet, rather than trusting one click. (4) When an element genuinely has no accessible name (e.g. an unlabeled edit-mode `<Textarea>`), prefer adding a minimal `aria-label` to the component over reaching for a positional/CSS locator in the test — a real accessibility gap and a brittle-selector risk are usually the same finding.
- **Applies to**: implement, impl-review (any future `/10x-e2e`-generated test touching a `client:load` form or a Supabase-backed write)

## Audyt "swallowed error" (M3L5) — wynik czysty

- **Context**: audyt po lekcji "Debugowanie z AI: od stack trace" (M3L5),
  pod kątem OWASP A10:2025 (Mishandling of Exceptional Conditions) —
  wzorzec, gdzie `catch` loguje błąd (`console.warn`/`console.error`), ale
  zwraca 2xx / fałszywy sukces zamiast propagować go do wywołującego.
- **Metoda**: `grep -rn "console\.\(warn\|error\)"` + ręczny przegląd
  każdego bloku `catch` w `src/` (poza testami), potem niezależne
  powtórzenie na plikach nieprzeczytanych za pierwszym razem
  (`middleware.ts`, `supabase.ts`, pełna treść `[id].ts`/`index.ts`).
- **Wynik (2026-09-11)**: brak instancji wzorca "fałszywy sukces". Każdy
  `catch`, który loguje, też propaguje błąd: warstwa service (`mapError()`
  w `flashcards.service.ts`/`review.service.ts`, 6 gałęzi błędu w
  `ai-flashcard-generation.service.ts`) zawsze zwraca `{ error }`; warstwa
  API (`flashcards/{index,[id],generate}.ts`, `[id]/review.ts`) zawsze
  mapuje `{ error }` na status !=2xx; komponenty React zawsze wołają
  `setError(...)` w `catch`, nigdy nie chowają błędu po cichu.
- **Jedyna nietrywialna obserwacja**: `middleware.ts` traktuje wyjątek z
  `supabase.auth.getUser()` (przez `callSupabaseAuth`, który łapie i
  zwraca `{ ok: false }`) tak samo jak brak sesji — użytkownik trafia na
  `/auth/signin` (trasy chronione) albo staje się anonimowy (trasy
  publiczne), bez żadnego komunikatu "usługa auth ma przejściowy problem".
  To **nie** jest instancja audytowanego wzorca (nie zwraca fałszywego
  sukcesu — zachowanie jest fail-closed, bezpieczniejsze niż odwrotność),
  ale warto to świadomie zaakceptować jako kompromis UX, nie przeoczenie.
- **Rule**: przy każdym nowym `catch` w `src/lib/services/` lub
  `src/pages/api/` — albo musi zwrócić `{ error }`/status !=2xx, albo mieć
  w kodzie udokumentowany powód, czemu połknięcie jest bezpieczne (np.
  `safeReadText()` w `ai-flashcard-generation.service.ts`, gdzie połknięty
  błąd odczytu body i tak prowadzi do kontrolowanego
  `GENERATION_FAILED_ERROR`, nie do fałszywego sukcesu).
- **Applies to**: implement, impl-review — sprawdzać przy każdym PR
  dodającym nowy `try/catch` w warstwie service lub API.
