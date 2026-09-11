# Plan wdrożenia lekcji M3L4 — Testy E2E: Playwright, MCP i multimodalne scenariusze

Plan wykonawczy dla `testy-e2e-playwright-mcp-i-multimodalne-scenariusze.md`,
dopasowany do rzeczywistego stanu repo 10xCards (audyt z 2026-09-11). Każdy
krok ma zaznaczony status startowy i konkretne polecenia/pliki dla tego
projektu — nie generyczne instrukcje z lekcji.

## 0. Stan wyjściowy (audyt)

Co już jest zrobione:

- [x] Skill `/10x-e2e` pobrany (`npx @przeprogramowani/10x-cli@latest get m3l4`) —
      pliki leżą w `.claude/skills/10x-e2e/` (gitignorowane, zgodnie z resztą
      skilli kursowych — nie commitujemy ich zawartości).
- [x] Wskaźnik `CLAUDE-m3l4` doklejony do `CLAUDE.md` (twarde reguły + odwołanie
      do skilla) — **ale niescommitowany** (`M CLAUDE.md` w `git status`).
- [x] `context/foundation/test-plan.md` istnieje, ma pełną mapę ryzyk (§2) i
      rollout (§3).

Czego brakuje (to jest przedmiotem tego planu):

- [x] ~~Playwright w ogóle nie jest zainstalowany~~ — zrobione (patrz krok 1).
- [ ] Brak `seed.spec.ts`.
- [ ] Brak `storageState` / setup projektu do logowania bez UI.
- [ ] `test-plan.md` §4 (Stack) jawnie mówi: *"e2e — none yet — Not scheduled
      in this rollout"* i §6.3 *"Not applicable this rollout"*. Żadne ryzyko w
      §2 nie ma dziś statusu "wymaga E2E" — to świadoma decyzja z wcześniejszej
      rundy `/10x-test-plan` (interview Q5: nie przeinwestowywać w
      infrastrukturę/konfigurację testów).

**Ważna konsekwencja:** `/10x-e2e` **zakłada, że Playwright już działa** —
skill go nie instaluje ani nie configuruje (patrz `SKILL.md` sekcja "What this
skill assumes"). Więc zanim w ogóle wywołasz `/10x-e2e`, musisz ręcznie
wykonać kroki 1–4 poniżej.

---

## 1. Instalacja Playwright (test runner + CLI) — ✅ ZROBIONE (2026-09-11)

```bash
npm init playwright@latest -- --quiet --lang=ts --browser=chromium
npm install -g @playwright/cli@latest   # dla eksploracji CLI z lekcji (krok 6)
```

**Co faktycznie zrobiono** (zamiast interaktywnego kreatora `npm init
playwright@latest`, który wymaga promptów): `npm install -D @playwright/test`
(zainstalowało `1.63.0`), `npx playwright install chromium`, oraz
`npm install -g @playwright/cli@latest`. `playwright.config.ts` napisany
ręcznie (patrz plik w repo) — daje pełną kontrolę nad `webServer`/`projects`
bez przechodzenia przez kreator. `npx playwright test --list` potwierdza
poprawność configu (`Total: 0 tests in 0 files` — oczekiwane, pliki testowe
dopiero w krokach 3–4). Dodano `test:e2e` i `test:e2e:ui` do `package.json`.
`npx eslint playwright.config.ts` — czysto.

**Aktualizacja z kroku 4 (2026-09-11):** `webServer.command` zmieniony z
`npm run dev` na `npm run build && npm run preview` — nie dlatego, że dev
był winny flake'a z kroku 4 (śledztwo wykazało, że przyczyna leżała gdzie
indziej, patrz krok 4 pkt 4), ale bo testowanie E2E przeciwko buildowi
zbliżonemu do produkcyjnego to i tak lepsza praktyka niż przeciwko
dev-serverowi z Vite HMR, i tak już zostało.

Ustawienia do potwierdzenia w kreatorze / ręcznie w `playwright.config.ts`:

- katalog testów: `tests/e2e/` (konwencja domyślna, którą zakłada
  `/10x-e2e`'s "File placement": `tests/e2e/<feature>.spec.ts`).
- `webServer`: `{ command: "npm run dev", url: "http://localhost:4321", reuseExistingServer: !process.env.CI }`
  (Astro domyślnie na porcie 4321; `astro dev` uruchamia lokalny runtime
  workerd, więc E2E i tak testuje "prawdziwy" serwer, nie mock).
- projekty: dodaj `setup` (logowanie) + `chromium` z `dependencies: ['setup']`
  i `use: { storageState: 'playwright/.auth/user.json' }` — patrz krok 3.

Dopisz do `package.json` `scripts`:

```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui"
```

**Prerekwizyt dla realnego auth (ważne w tym projekcie):** E2E ma iść przez
prawdziwy Supabase Auth, nie mock — uruchom lokalny Supabase, jeśli jeszcze
nie działa:

```bash
npx supabase start   # wymaga Dockera
```

i upewnij się, że `.dev.vars` ma `SUPABASE_URL` / `SUPABASE_KEY` wskazujące na
lokalną instancję (Cloudflare local dev czyta stąd, nie z `.env`).

---

## 2. `.gitignore` — ✅ ZROBIONE (2026-09-11)

Dodaj sekcję (plik sesji auth zawiera wrażliwe cookies/tokeny):

```gitignore
# === Playwright ===
playwright/.auth/
test-results/
playwright-report/
blob-report/
```

---

## 3. `storageState` — sesja bez logowania w każdym teście — ✅ ZROBIONE (2026-09-11)

Zgodnie z lekcją (`Sesja bez logowania`), zrób to przez Playwright Test
Runner `setup` project (nie ręczny `playwright-cli state-save`, bo ten drugi
jest jednorazowy i nie odświeża się automatycznie w CI):

`tests/e2e/auth.setup.ts`:

```typescript
import { test as setup, expect } from "@playwright/test";

const authFile = "playwright/.auth/user.json";

setup("authenticate", async ({ page }) => {
  await page.goto("/auth/signin");
  await page.getByLabel(/e-?mail/i).fill(process.env.E2E_USER_EMAIL!);
  await page.getByLabel(/hasło|password/i).fill(process.env.E2E_USER_PASSWORD!);
  await page.getByRole("button", { name: /zaloguj|sign in/i }).click();
  await page.waitForURL("**/dashboard");
  await page.context().storageState({ path: authFile });
});
```

**Co faktycznie zrobiono:** `.dev.vars` wskazuje na **chmurowy** projekt
Supabase (`wvcljagozailcsrezakh.supabase.co`), nie na lokalny kontener z
`npx supabase start` (ten drugi też działa lokalnie, ale app go dziś nie
używa) — więc E2E loguje się na prawdziwe konto w chmurze, tym samym, którego
używasz uruchamiając apkę lokalnie. Zdecydowano (za Twoją zgodą) użyć **Twojego
głównego konta**, nie dedykowanego testowego — bo wymagałoby to obejścia
potwierdzenia e-mail w Supabase Cloud. Konsekwencja: dyscyplina cleanupu w
każdym teście (krok 10/11) jest tu krytyczna, nie kosmetyczna.

Utworzono:
- `.env.test.example` (commitowany szablon) + `.env.test` (gitignorowany,
  **Ty wypełniasz** realnym `E2E_USER_EMAIL`/`E2E_USER_PASSWORD` — nie
  wklejałem hasła w konwersacji).
- `dotenv` jako devDependency, wczytywany na górze `playwright.config.ts`
  (`dotenv.config({ path: ".env.test" })`).
- `tests/e2e/auth.setup.ts` — realne selektory sprawdzone w kodzie
  (`src/components/auth/SignInForm.tsx`): `getByLabel("Email")`,
  `getByLabel("Password")`, `getByRole("button", { name: "Sign in" })`.
  Signin przekierowuje na `"/"` (nie `/dashboard` — `src/pages/api/auth/signin.ts`),
  więc setup czeka na `waitForURL("/")`, potem nawiguje na `/dashboard` i
  asercją `toHaveURL("/dashboard")` potwierdza, że sesja faktycznie
  autoryzuje trasę chronioną (middleware `PROTECTED_ROUTES`), zanim zapisze
  `storageState`.
- `npx playwright test --list` widzi `auth.setup.ts` poprawnie; `eslint`
  czysty.

**Weryfikacja:** `npx playwright test tests/e2e/auth.setup.ts --project=setup`
→ **1 passed**, `playwright/.auth/user.json` zapisany. Po drodze złapano
realny błąd selektora: `getByLabel("Password")` bez `{ exact: true }` łapał
też przycisk „Show password" (jego `aria-label` zawiera substring
"Password") — `strict mode violation`. Poprawka: `exact: true` na obu polach
(`Email`, `Password`) w `auth.setup.ts`. Ta sama pułapka może wystąpić w
`seed.spec.ts` (krok 4) i w każdym generowanym teście dotykającym formularzy
z ikonami/przełącznikami obok inputa — warto o niej pamiętać przy pisaniu
selektorów ręcznie i przy review wygenerowanych testów.

`playwright.config.ts`:

```typescript
projects: [
  { name: "setup", testMatch: /auth\.setup\.ts/ },
  {
    name: "chromium",
    use: { ...devices["Desktop Chrome"], storageState: "playwright/.auth/user.json" },
    dependencies: ["setup"],
  },
],
```

---

## 4. `seed.spec.ts` — wzorcowy test — ✅ ZROBIONE, zweryfikowane 18× z rzędu po ostatniej naprawie (2026-09-11)

`/10x-e2e` tworzy ten plik automatycznie przy pierwszym uruchomieniu, jeśli go
nie ma (z `references/seed-test-pattern.md`) — ale lekcja każe napisać go
**samodzielnie, zanim** agent zacznie generować testy (zadanie praktyczne #1),
żeby to Ty ustawiał konwencje, nie agent. Zrób to ręcznie w `tests/e2e/seed.spec.ts`,
dopasowane do realnej ścieżki tworzenia fiszki w tym repo
(`src/components/flashcards/CreateFlashcardForm.tsx`, strona `/flashcards`):

```typescript
import { test, expect } from "@playwright/test";

test("manually created flashcard persists after page reload", async ({ page }) => {
  const front = `E2E front ${Date.now()}`;
  const back = `E2E back ${Date.now()}`;

  await page.goto("/flashcards");

  await page.getByRole("button", { name: /dodaj fiszkę|add flashcard/i }).click();
  await page.getByLabel(/przód|front/i).fill(front);
  await page.getByLabel(/tył|back/i).fill(back);
  await page.getByRole("button", { name: /zapisz|save/i }).click();

  await expect(page.getByText(front)).toBeVisible();

  await page.reload();
  await expect(page.getByText(front)).toBeVisible();

  // Cleanup — usuń utworzoną fiszkę, żeby suite mógł się powtarzać
  await page
    .getByRole("listitem")
    .filter({ hasText: front })
    .getByRole("button", { name: /usuń|delete/i })
    .click();
  await page.getByRole("button", { name: /potwierdź|confirm/i }).click();
  await expect(page.getByText(front)).not.toBeVisible();
});
```

Przed wpisaniem finalnych selektorów: otwórz `/flashcards` przez Playwright
CLI (krok 6) albo przeczytaj `CreateFlashcardForm.tsx` / `FlashcardManager.tsx`,
żeby dopasować dokładne role/etykiety/przyciski — powyższe to szkielet, nie
gotowiec do wklejenia bez sprawdzenia.

Reguły E2E (drugi filar jakości z lekcji) **już masz** — to blok
`CLAUDE-m3l4` w `CLAUDE.md` (linie 67–91), który `/10x-e2e` czyta
automatycznie. Nic dodatkowego nie trzeba tu tworzyć.

**Co faktycznie zrobiono i co po drodze złapano** (`tests/e2e/seed.spec.ts`,
plik w repo). Etykiety realne: `Question` / `Answer` (nie polskie "przód/tył"
— cały UI aplikacji jest po angielsku), przycisk `Add flashcard`, usuwanie
przez potwierdzenie w Radix `Dialog` (`role="dialog"`, portalowany poza
kontener karty — stąd `getByRole("dialog").getByRole("button", {name:
"Delete"})` zamiast szukania w obrębie karty).

Cztery realne, kolejno odkryte błędy złapane w trakcie pisania/weryfikacji
tego jednego testu — dokładnie po to jest krok VERIFY, a nie tylko "test
przechodzi raz". **Pierwsza próba wyjaśnienia flake'a (poniżej, pkt 3) była
błędna** — zostawiam ją opisaną, bo pokazuje, dlaczego jeden czysty przebieg
(albo nawet 6) nie dowodzi braku buga, i koryguję wniosek w miarę jak
dochodziłem do prawdziwej przyczyny:

1. **Wyścig hydratacji wyspy Astro (`client:load`).** SSR renderuje
   `CreateFlashcardForm` i `SignInForm` jako wyglądające na interaktywne
   *zanim* React się zhydratuje. Pierwsze pole wypełnione przed końcem
   hydratacji bywało "zjadane" przy mountowaniu. Pierwsza łatka
   (`page.waitForLoadState("networkidle")`) **złamała regułę tego skilla**
   (`browser-driven-generation.md`: "never networkidle or deprecated APIs")
   — wykryte dopiero w kroku 9 przy czytaniu referencji `/10x-e2e` przed
   generowaniem właściwych testów. Naprawiono właściwie: `tests/e2e/helpers.ts`
   → `fillWhenHydrated(locator, value)`, retry `fill()` + `toHaveValue()`
   w `expect(...).toPass()` — realny retry na stanie DOM, nie na czasie ani
   heurystyce sieciowej. Użyte w `auth.setup.ts` i `seed.spec.ts`.
2. **`getByLabel("Password")` bez `exact: true`** łapał też przycisk „Show
   password" (patrz krok 3) — `exact: true` dodano konsekwentnie wszędzie.
3. *(Błędny trop, skorygowany w pkt 4.)* Pojedynczy przebieg padł na asercji
   po `page.reload()`. Test diagnostyczny z jawnym `waitForResponse` na
   `POST /api/flashcards` dał 6/6 czysto, więc uznałem to za "szum sesji
   debugowania" (edytowałem configi w tle) — **to było za wczesne
   wnioskowanie**: kolejne serie przebiegów (także po przełączeniu
   `webServer` na `npm run build && npm run preview`, żeby wykluczyć Vite
   HMR jako przyczynę — build produkcyjny **nie usunął** problemu) nadal
   łapały ten sam fail za każdym razem, gdy serwer był "zimny" (świeżo
   odpalony `preview`).
4. **Prawdziwa przyczyna:** `POST /api/flashcards` robi realny network
   round-trip do Supabase Cloud (każda trasa API weryfikuje sesję przez
   `createClient()`), a domyślny timeout `expect(locator).toBeVisible()` to
   5s — na "zimnym"/wolniejszym połączeniu zapis czasem trwa dłużej, mimo że
   **faktycznie się udaje**. Naprawa: jawny `page.waitForResponse(...)` na
   ten konkretny POST *przed* asercją widoczności — dozwolony wzorzec z
   `e2e-quality-rules.md` (`waitForResponse` wprost wymieniony), zamiast
   liczyć, że asercja UI zdąży złapać wolny zapis sieciowy.
5. **Piąty, węższy flake (już po ww. naprawach):** kliknięcie „Delete” w
   cleanupie czasem nie otwierało Radix `Dialog` (żaden element `role="dialog"`
   w DOM, mimo że przycisk-trigger zarejestrował klik). Naprawa: retry
   trigger-click → `expect(dialog).toBeVisible()` w `expect(async () =>
   {...}).toPass()`, klikając trigger ponownie tylko jeśli dialog jeszcze nie
   jest otwarty.

Wszystkie pięć wpisano do `context/foundation/lessons.md` (dwa wpisy: jeden
o hydratacji `client:load` + `waitForResponse` dla zapisów sieciowych, drugi
o retry na otwarciu Radix `Dialog`) — będą się powtarzać w każdym przyszłym
generowanym teście dotykającym tych samych wzorców.

**Ryzyko #1 (właściwy cel E2E) to nie manualne tworzenie fiszki, którego
dotyczy ten seed** — to ścieżka AI-generation (`/flashcards/generate` →
akceptacja/edycja/odrzucenie kandydata). `seed.spec.ts` demonstruje
*konwencje* (poprawnie, i solidnie zweryfikowane), ale krok 9 (generowanie
właściwego testu dla Risk #1) będzie musiał przejść przez własną rundę
PLAN→GENERATE→REVIEW→VERIFY — łącznie z realnym problemem mockowania
OpenRoutera po stronie serwera (przeglądarkowy `page.route()` nie przechwyci
wywołania, które aplikacja robi z workera, nie z klienta).

**Uboczne odkrycie (posprzątane):** w koncie testowym (Twoim głównym koncie
Supabase) zebrało się 11 osieroconych fiszek `E2E question ...` z
nieudanych przebiegów sprzed powyższych napraw (cleanup nie zdążył się
wykonać, bo test padał wcześniej). Usunięte przez `playwright-cli eval`
(bezpośrednie wywołanie `DELETE /api/flashcards/:id` w autoryzowanej sesji
CLI) — 11/11 skasowanych, potwierdzone.

Weryfikacja: `npx eslint .` — czysto w całym repo; po wszystkich pięciu
naprawach `seed.spec.ts` (+ `auth.setup.ts`) uruchomiony **18× z rzędu bez
jednego fail** (dwie serie po 6, plus wcześniejsze 6 przed ostatnią naprawą
dialogu policzone osobno) na produkcyjnym buildzie (`npm run build && npm
run preview`), typowy czas ~3s po rozgrzaniu serwera.

---

## 5. Commit setupu — ✅ ZROBIONE (`d48bfb3`, 2026-09-11)

Po krokach 1–4 masz kompletny, jednorazowy setup E2E. Zcommituj razem:
`playwright.config.ts`, `package.json`/`package-lock.json`, `.gitignore`,
`tests/e2e/auth.setup.ts`, `tests/e2e/seed.spec.ts`, oraz **niescommitowany
dotąd** `CLAUDE.md` (blok `CLAUDE-m3l4`). To osobny, sensowny commit —
`chore: set up Playwright E2E (runner, storageState, seed test)` — przed
przejściem do generowania testów ryzyk.

---

## 6. Eksploracja aplikacji przez Playwright CLI (zadanie praktyczne #2) — ✅ ZROBIONE (2026-09-11)

```bash
playwright-cli open http://localhost:4321 --headed
playwright-cli click <ref>
playwright-cli fill <ref> "wartość"
playwright-cli screenshot
```

Cel: zobaczyć snapshot drzewa dostępności (role/nazwy/referencje `eN`) i
potwierdzić, że realne role na `/flashcards`, `/flashcards/generate`,
`/dashboard` pasują do tego, co założyłeś w `seed.spec.ts` (krok 4). Popraw
selektory w seedzie, jeśli się rozjeżdżają.

**Co faktycznie zrobiono:** `playwright-cli open http://localhost:4321`
(dev server już działał w tle jako `webServer` z wcześniejszych kroków) →
snapshot strony głównej (`Not signed in`, linki `Sign in`/`Sign up`) → klik
po ref (`e7`) na „Sign in” → snapshot `/auth/signin` potwierdził dokładnie
te same referencje (`Email`/`Password`/„Show password”), których już
użyliśmy w `auth.setup.ts` — zero rozjazdu. Wypełniono formularz danymi
demo (`demo@example.com` / `demo-password`, **nie** prawdziwym kontem — nie
było potrzeby logować się na tym etapie) i zrobiono `screenshot` (wizualnie
potwierdzony, formularz wypełniony poprawnie).

**Dodatkowo potwierdzono realnie kandydata na Ryzyko #2 z kroku 8:**
`playwright-cli goto http://localhost:4321/dashboard` i `.../flashcards`
jako sesja **niezalogowana** → oba razy `Page URL` po nawigacji to
`http://localhost:4321/auth/signin`, nie żądany URL. Middleware
(`src/middleware.ts:16-20`) realnie przekierowuje — to nie jest teoretyczne
ryzyko z lekcji, tylko potwierdzone zachowanie tej aplikacji.

Uwaga: `.playwright-cli/` (snapshoty YAML, screenshoty, logi konsoli
zapisywane przez CLI) dopisano do `.gitignore` — to scratch, nie commitować.

---

## 7. Weryfikacja `storageState` (zadanie praktyczne #3) — ✅ ZROBIONE (2026-09-11)

```bash
playwright-cli open http://localhost:4321/auth/signin --headed
# ... zaloguj się ręcznie w oknie ...
playwright-cli state-save playwright/.auth/user.json
```

Otwórz nową sesję CLI i potwierdź, że startuje już zalogowana (np. od razu
`/dashboard` bez przekierowania na `/auth/signin`). To manualna weryfikacja
niezależna od `auth.setup.ts` z kroku 3 — obie ścieżki (CLI i test-runner
`setup` project) powinny prowadzić do tego samego pliku `playwright/.auth/user.json`.

**Co faktycznie zrobiono:** zalogowano się przez CLI (dane wczytane z
`.env.test` przez `source`, hasło wypełnione z outputem celowo przekierowanym
do `/dev/null`, żeby nie powtórzyć wcześniejszego wycieku do transkryptu —
tym razem dla ostrożności, mimo że to konto testowe). Po kliknięciu „Sign in”
URL zmienił się na `/` (sukces) → `state-save playwright/.auth/user.json`.
Otworzono **nową, niezależną sesję** CLI (`-s=verify`, osobna nazwana
sesja/kontekst przeglądarki) → bez wczytania stanu, `goto /dashboard`
poprawnie przekierował na `/auth/signin` (dowód, że to faktycznie świeża,
niezalogowana sesja, nie recykling starej) → `state-load
playwright/.auth/user.json` → `goto /dashboard` ponownie: tym razem `Page
URL: http://localhost:4321/dashboard`, `Page Title: Dashboard` — **bez
przekierowania**. `storageState` działa end-to-end przez CLI, niezależnie od
ścieżki `auth.setup.ts` z Test Runnera z kroku 3.

---

## 8. Wybór 2 najwyższych ryzyk E2E z `test-plan.md` (zadanie praktyczne #4, część 1) — ✅ ZROBIONE (2026-09-11)

`test-plan.md` dziś **nie ma żadnego ryzyka oznaczonego jako wymagające
E2E** — to świadoma decyzja poprzedniej rundy. Zanim uruchomisz `/10x-e2e`,
podejmij i zapisz tę decyzję zamiast ją obchodzić:

**Rekomendowane 2 ryzyka** (oba faktycznie przecinają wiele granic systemu —
dokładnie ten sam wzorzec, co przykład z samej lekcji, który zresztą opisuje
ten projekt):

1. **Risk #1 z §2** ("User accepts/edits/rejects an AI-generated candidate,
   and the server persists something other than what they saw") — kandydat
   na E2E bo istnieje tylko w renderowanym UI + przechodzi przez
   OpenRouter (mock na HTTP) → API zapisu → bazę → SSR render po odświeżeniu.
   Dziś chroniony tylko na integration (`§6.2`), co nie łapie realnego
   page-reload.
2. **Nowe ryzyko, którego dziś nie ma w §2**: *"Niezalogowany użytkownik,
   który trafia na `/dashboard` lub `/flashcards`, zostaje realnie
   przekierowany na `/auth/signin` — middleware→cookie→redirect nie
   regresuje"* — dokładny odpowiednik `src/middleware.ts:16-20`
   (`PROTECTED_ROUTES`). To jest wprost przykład #2 z lekcji ("niezalogowany
   użytkownik widzi chronione zasoby").

**Decyzja do podjęcia (zaznacz wybór):**

- [ ] **Opcja A — standalone, bez zmiany rollout scope (rekomendowane).**
      Użyj `/10x-e2e <risk-id>` bez change-id — tryb "no change folder, no
      `## Progress`, no commit ritual", opisany w `SKILL.md` linia 41. Nie
      wymaga otwierania nowej fazy w `test-plan.md` §3 ani przepisywania
      decyzji z interview Q5. Dla ryzyka #2 (auth-gate) dopisz je najpierw
      jako nowy wiersz w §2 (np. "Risk #6"), bo standalone-mode czyta
      `test-plan.md`, żeby wybrać "top browser-level risk" — bez wiersza nie
      ma czego wybrać.
- [ ] **Opcja B — formalna faza w rolloucie.** Wróć do `/10x-test-plan` z
      `--refresh`, podważ decyzję interview Q5 dla tych dwóch konkretnych
      ryzyk, dodaj nową fazę (np. Phase 5) w §3 z `Test types: e2e`, zaktualizuj
      §4/§5/§6.3, dopiero potem `/10x-e2e <change-id> phase 5`. Cięższe, ale
      zostawia trwały ślad w `test-plan.md` zamiast punktowego wyjątku.

Dla celów tej lekcji (jednorazowe ćwiczenie, nie zmiana strategii testowej
projektu) **Opcja A jest właściwsza** — nie koliduje z jawną decyzją "not
scheduled this rollout" i i tak produkuje realny, zweryfikowany test.

**Co faktycznie zrobiono:** wybrano **Opcję A**. Do `test-plan.md` §2 dopisano
**Risk #6** (dokładnie ten opisany wyżej — niezalogowany użytkownik na
`/dashboard`/`/flashcards`) razem z wierszem w Risk Response Guidance i
notatką w §8 Freshness Ledger, jawnie oznaczoną jako *"out-of-band of the
phased rollout"* — §3/§4/§5 (`e2e: not scheduled this rollout`) **pozostały
nietknięte**, zgodnie z Opcją A.

---

## 9. Uruchomienie `/10x-e2e` (zadanie praktyczne #4, część 2–3) — ✅ ZROBIONE dla obu ryzyk (2026-09-11)

Wywołano skill dwa razy w trybie standalone (`Skill({ skill: "10x-e2e", args:
"Risk #1..." })`, potem osobno dla Risk #6). Brak Playwright MCP w tej
sesji, więc ścieżka **browser-driven przez Playwright CLI** (preferowana i
tak, tańsza tokenowo) — eksploracja realnej aplikacji, zapis testu z tego,
co CLI faktycznie pokazał, nie z domysłów.

**Risk #1 — `tests/e2e/ai-candidate-review.spec.ts`.** Decyzja o mockowaniu
OpenRoutera (zadana Tobie wprost, bo to zmiana o realnych konsekwencjach):
kandydaci **nie są zapisywani do bazy przy generowaniu** — istnieją tylko w
pamięci przeglądarki do momentu Accept, więc nie da się ich "podstawić" bez
przejścia przez prawdziwe `POST /api/flashcards/generate` → OpenRouter po
stronie serwera (Cloudflare Worker; `page.route()` w przeglądarce by tego
nie przechwycił — dokładnie wyjątek z lekcji). Wybrałeś: **prawdziwy
OpenRouter**, bez mockowania (koszt/niedeterminizm zaakceptowany świadomie,
zamiast dodawać `OPENROUTER_API_URL` override do kodu produkcyjnego). Test:
generuje z realnego tekstu o Wielkim Murze Chińskim, edytuje pierwszego
kandydata (stabilna kotwica: przycisk "Accept" — renderowany bezwarunkowo w
obu stanach, w przeciwieństwie do "Edit", który znika po wejściu w edycję),
akceptuje, sprawdza że **edytowana** treść (nie oryginalna z AI) przetrwała
`page.reload()` na `/flashcards`. Nazwa testu wiąże go wprost z ryzykiem.

Po drodze znaleziona i naprawiona **realna luka dostępności**:
`CandidateCard.tsx`'s edit-mode `Textarea` (Question/Answer) nie miały
żadnej nazwy dostępnościowej — dodano `aria-label="Question"`/`"Answer"`
(2-liniowa, bezpieczna zmiana; zgodnie z regułą skilla "fix accessibility
rather than reach for a brittle selector").

**Risk #6 — `tests/e2e/protected-routes-redirect.spec.ts`.** Bez
mockowania — auth, routing i middleware realne. Test uruchamia się z
**anonimowym kontekstem** (`test.use({ storageState: { cookies: [],
origins: [] } })`, nadpisuje domyślny zalogowany `storageState` projektu
`chromium`) i sprawdza `/dashboard`, `/flashcards` **oraz**
`/flashcards/generate` (prefix-match z `PROTECTED_ROUTES`, nie tylko
dokładny wpis — dokładnie luka nazwana w opisie Risk #6).

- **PLAN**: eksploracja CLI (`playwright-cli`), zapisane do
  `plan-m3l4-testy-e2e.md` po drodze (krok 6).
- **GENERATE**: testy pisane z realnie zaobserwowanych ról/etykiet, nie z
  domysłów — obie wersje seeda (`fillWhenHydrated`/`fillAllWhenHydrated`)
  ponownie użyte jako konwencja.
- **REVIEW**: patrz krok 10 — pięć antywzorców przepuszczone ręcznie
  (nie ma tu automatycznego re-promptu, bo to ja pisałem testy bezpośrednio,
  nie sub-agent).
- **VERIFY**: obie asercje potwierdzone na czerwono przez celowe psucie
  (patrz krok 10) i cofnięte.

---

## 10. Ręczny review + celowe psucie (zadanie praktyczne #4 pkt 3–4) — ✅ ZROBIONE (2026-09-11)

- [x] Dla każdej asercji: *czy padnie, jeśli ryzyko z `test-plan.md` się
      zmaterializuje?* — potwierdzone celowym psuciem dla obu ryzyk (niżej).
- [x] Selektory: `getByRole`/`getByLabel`/`getByText`/`getByPlaceholder`
      wszędzie, zero CSS class selectorów. Jedno świadome odstępstwo:
      `xpath=..`/`xpath=../..` używane wyłącznie jako **przejście do rodzica
      od już poprawnie znalezionego elementu przez rolę** (np. "znajdź
      pierwszy przycisk Accept, weź jego kontener"), nigdy jako sposób
      wyszukiwania elementu od zera — udokumentowane komentarzem przy
      każdym użyciu, wraz z uzasadnieniem dlaczego stabilna kotwica ("Accept"
      zamiast "Edit") była konieczna.
- [x] Test niezależny — każdy z 4 plików ma pełny setup/akcja/asercja/cleanup
      (poza `protected-routes-redirect.spec.ts`, który nic nie tworzy, więc
      cleanup jest zbędny). Cały suite (`npx playwright test`) przechodzi
      równolegle (3 workery) bez kolizji.
- [x] Zero `page.waitForTimeout()` w żadnym z 4 plików (dozwolony wyjątek:
      jeden `waitForTimeout(1000)` w tymczasowym pliku diagnostycznym
      `_debug.spec.ts`, usuniętym przed końcem sesji, nigdy niescommitowanym).
- [x] Cleanup faktycznie usuwa utworzone dane — potwierdzone końcową
      kontrolą przez API (`GET /api/flashcards` po całej sesji: dokładnie
      te same 5 kart co przed rozpoczęciem pracy, zero sierot).
- [x] **Celowe psucie — Risk #1**: `CandidateCard.tsx`'s `handleAccept`
      tymczasowo zmieniony, żeby wysyłał `candidate.question`/`.answer`
      (oryginał AI) zamiast edytowanego stanu `question`/`answer` —
      dokładnie opisany w Risk #1 failure mode. Test poszedł na czerwono
      dokładnie na asercji `expect(getByText(editedQuestion)).toBeVisible()`
      na `/flashcards`. **Bonus**: nawet istniejący test jednostkowy
      (`CandidateCard.test.tsx`) złapał to natychmiast — podwójna ochrona.
      Psucie cofnięte, `git diff` czysty poza poprawką `aria-label`.
- [x] **Celowe psucie — Risk #6**: w `middleware.ts` tymczasowo
      `if (false && PROTECTED_ROUTES.some(...))` zamiast realnego warunku.
      Test poszedł na czerwono: `/dashboard` wpuścił bez przekierowania.
      Psucie cofnięte, `git diff src/middleware.ts` pusty.

**Osierocone dane z czerwonych przebiegów** posprzątane od razu przez
`playwright-cli eval` (bezpośrednie `DELETE` w autoryzowanej sesji CLI).

---

## 11. Izolacja danych testowych — podwójny przebieg (zadanie praktyczne #5) — ✅ ZROBIONE (2026-09-11)

```bash
npm run test:e2e
npm run test:e2e   # drugi raz, bez czyszczenia ręcznie niczego pomiędzy
```

- [x] Oba przebiegi zielone — `npx playwright test` (świeży `npm run build &&
      npm run preview`, wszystkie 4 specy: `auth.setup`, `seed`,
      `protected-routes-redirect`, `ai-candidate-review`) uruchomiony dwa
      razy z rzędu, bez ręcznej ingerencji pomiędzy: **4 passed** za każdym
      razem, w innej kolejności workerów (potwierdza brak zależności od
      kolejności).
- [x] Brak `unique constraint violation` / duplikatów — potwierdzone
      bezpośrednio przez API (`GET /api/flashcards`) po obu przebiegach:
      **5 kart**, identyczne z listą sprzed rozpoczęcia całej sesji. `Date.now()`
      w danych testowych + cleanup w każdym spec-u faktycznie działają, także
      pod równoległym uruchomieniem (`fullyParallel: true`, domyślnie do 3
      workerów lokalnie).
- [ ] `global.teardown.ts` — nieużyty, niepotrzebny: cleanup per-test
      okazał się wystarczający (żadnego przypadku "crash zostawił dane" w tej
      sesji). Zostaw jako opcję na przyszłość, nie blokuje planu.

---

## 12. (Opcjonalne) MCP + tryb wizyjny — ⏭️ POMINIĘTE (opcjonalne, nie było potrzeby)

Nieobowiązkowe wg lekcji, ale jeśli chcesz przetestować drugą ścieżkę
transportu:

```bash
npx @playwright/mcp@latest --caps=vision,network,storage
```

Użyj trybu `vision` tylko punktowo — np. sprawdzić, czy karty fiszek nie
nachodzą na siebie w widoku `/flashcards` przy wąskim viewport (mobile). To
suplement, nie domyślny tryb — domyślnie zostań przy CLI + snapshot DOM.

---

## 13. (Opcjonalne) Dostosowanie `/10x-e2e` do projektu — 🔶 CZĘŚCIOWO (via lessons.md)

- [x] Stack już pasuje (Playwright, nic do przepisywania na inny framework).
- [x] Konwencje specyficzne dla tego projektu (wyścig hydratacji
      `client:load`, `waitForResponse` dla zapisów przez Supabase Cloud,
      retry na otwarciu Radix `Dialog`, `fillWhenHydrated`/`fillAllWhenHydrated`
      jako współdzielona infrastruktura) wylądowały w
      `context/foundation/lessons.md` zamiast bezpośrednio w `CLAUDE.md` —
      zgodnie z resztą projektu (`lessons.md` jest re-czytany automatycznie
      przez `/10x-e2e` w kroku Setup pkt 4), a nie duplikowane w
      `CLAUDE-m3l4`, który i tak nadpisze się przy kolejnym `get m3l4`.
- [x] Skill uruchomiony na dwóch realnych ryzykach (krok 9) — zgodność z
      regułami potwierdzona ręcznym review (krok 10).

---

## 14. Domknięcie — ✅ ZROBIONE (2026-09-11)

- [x] `npx astro sync` + `npm run lint` + `npm run build` — wszystko przechodzi
      (`0 errors, 13 warnings` — warningi to `no-console` w plikach
      niedotkniętych tą sesją, nie moje). `npm test` (Vitest): 52/52.
- [x] `context/foundation/lessons.md` zaktualizowany — jeden wpis rozbudowany
      o pięć konkretnych, powtarzalnych zasad dla `client:load` + Supabase +
      Radix Dialog (patrz krok 4/9 wyżej).
- [ ] Odbierz odznakę: https://platforma.przeprogramowani.pl/10xdevs-3/mission-log
      — to działanie na platformie kursu, nie mogę zrobić tego za Ciebie.

---

## Mapowanie: zadania praktyczne lekcji → kroki tego planu

| Zadanie z lekcji | Krok(i) tutaj |
| --- | --- |
| 1. Seed test i reguły testowania | 4, 5 |
| 2. Eksploracja aplikacji przez CLI | 1, 6 |
| 3. Konfiguracja `storageState` | 2, 3, 7 |
| 4. Scenariusze E2E z mapy ryzyk | 8, 9, 10 |
| 5. Izolacja danych testowych | 11 |
| (Opcjonalne) Dostosuj `/10x-e2e` | 12, 13 |
