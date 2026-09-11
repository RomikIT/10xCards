import { test, expect } from "@playwright/test";
import { fillWhenHydrated } from "./helpers";

// risk: test-plan.md #1 — accepting/editing/rejecting an AI-generated candidate
// must persist exactly what the user saw, not the original AI output
// seed: tests/e2e/seed.spec.ts
//
// Real vs mocked boundary: OpenRouter is called for real here (no server-side
// mock exists for this project yet — see plan-m3l4-testy-e2e.md step 9 for
// why). Auth, routing, and the database are real throughout.

const STUDY_TEXT =
  "The Great Wall of China is over 13,000 miles long and was built over many centuries to defend against invasions from northern nomadic tribes.";

test("editing an AI-generated candidate before accepting persists the edit, not the original", async ({ page }) => {
  const editedQuestion = `E2E edited question ${Date.now()}`;

  // Generate real candidates from OpenRouter.
  await page.goto("/flashcards/generate");
  const generateButton = page.getByRole("button", { name: "Generate flashcards" });
  // confirmReactSaw: the raw textarea value can "stick" even when React's
  // controlled state missed the update entirely (its event delegation
  // wasn't attached yet) — the button only enables once React's own
  // character-count validation agrees, so that's the real confirmation.
  await fillWhenHydrated(
    page.getByPlaceholder("Paste a block of study text (notes, guide, textbook excerpt)…"),
    STUDY_TEXT,
    () => expect(generateButton).toBeEnabled(),
  );

  const generateResponse = page.waitForResponse(
    (r) => r.url().includes("/api/flashcards/generate") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await generateButton.click();
  await generateResponse;

  // Take the first candidate card, whatever the model actually returned —
  // the assertion below only depends on the edit we make, not on AI phrasing.
  // Anchor on the first "Accept" button: unlike "Edit" (replaced by "Cancel"
  // once editing starts), "Accept" renders unconditionally in both states,
  // so this lazily-re-evaluated locator keeps resolving to the same card
  // across the edit-mode transition. Walk up to its card container (button
  // -> button row -> card) rather than guessing a CSS class.
  const firstAcceptButton = page.getByRole("button", { name: "Accept" }).first();
  await expect(firstAcceptButton).toBeVisible();
  const firstCard = firstAcceptButton.locator("xpath=../..");
  // The question paragraph has no distinguishing role (CandidateCard renders
  // it as a plain <p>, first of two) — a real accessibility gap, same class
  // as the edit-mode textareas fixed alongside this test; left as a
  // follow-up rather than restructuring the read-only view here too.
  const originalQuestion = await firstCard.locator("p").first().innerText();

  await firstCard.getByRole("button", { name: "Edit" }).click();
  // No confirmReactSaw here: "Accept" stays enabled regardless of whether
  // this edit's state update actually landed (the unedited Answer alone
  // keeps canAccept true), so there's no derived signal to check against —
  // accepted residual risk; a failure here surfaces loudly at the assertion
  // on the real flashcards list below rather than silently.
  await fillWhenHydrated(firstCard.getByRole("textbox", { name: "Question" }), editedQuestion);

  const acceptResponse = page.waitForResponse(
    (r) => r.url().includes("/api/flashcards") && !r.url().includes("/generate") && r.request().method() === "POST",
  );
  await firstCard.getByRole("button", { name: "Accept" }).click();
  await acceptResponse;

  // Accepting removes the card from the candidate list on this page.
  await expect(page.getByText(editedQuestion, { exact: true })).not.toBeVisible();

  // The business outcome that proves Risk #1 is protected: what actually
  // got saved (and survives a reload) is the edit, never the original
  // AI-generated question — checked on the real flashcards list, not the
  // in-memory candidate state this page held.
  await page.goto("/flashcards");
  await expect(page.getByText(editedQuestion, { exact: true })).toBeVisible();
  await expect(page.getByText(originalQuestion, { exact: true })).not.toBeVisible();

  await page.reload();
  await expect(page.getByText(editedQuestion, { exact: true })).toBeVisible();

  // Cleanup — delete the flashcard this test created.
  const card = page.getByText(editedQuestion, { exact: true }).locator("xpath=..");
  const dialog = page.getByRole("dialog");
  await expect(async () => {
    if ((await dialog.count()) === 0) {
      await card.getByRole("button", { name: "Delete" }).click();
    }
    await expect(dialog).toBeVisible();
  }).toPass({ timeout: 10_000 });
  await dialog.getByRole("button", { name: "Delete" }).click();

  await expect(page.getByText(editedQuestion, { exact: true })).not.toBeVisible();
});
