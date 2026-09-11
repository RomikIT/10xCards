import { test, expect } from "@playwright/test";

// Seed test — the exemplar every /10x-e2e-generated test is modeled on.
// Demonstrates: role/label-based locators, wait-for-state (not time), a
// self-contained setup → action → assertion → cleanup cycle, unique test
// data (Date.now()), and a name tied to a real risk: a flashcard the user
// created must still be there after a reload, not just right after saving.

test("manually created flashcard persists after page reload", async ({ page }) => {
  const question = `E2E question ${Date.now()}`;
  const answer = `E2E answer ${Date.now()}`;

  await page.goto("/flashcards");
  // CreateFlashcardForm is a client:load React island — the SSR-rendered
  // textarea/button are interactive-looking before hydration attaches
  // handlers, so an early fill() can be silently wiped when React mounts.
  // Wait for the island's own JS chunks to finish loading, not a fixed delay.
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Question", { exact: true }).fill(question);
  await page.getByLabel("Answer", { exact: true }).fill(answer);
  await page.getByRole("button", { name: "Add flashcard" }).click();

  await expect(page.getByText(question, { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText(question, { exact: true })).toBeVisible();

  // Cleanup — delete the flashcard this test created so re-runs (and other
  // tests sharing this account) stay isolated. The card wrapper has no
  // dedicated role, so scope by the unique question text instead of index.
  const card = page.getByText(question, { exact: true }).locator("xpath=..");
  await card.getByRole("button", { name: "Delete" }).click();

  // DialogContent renders via a Portal (outside `card` in the DOM), so the
  // confirm button is scoped through the dialog role, not through `card` —
  // that also avoids matching the now-hidden trigger button of the same name.
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Delete" }).click();

  await expect(page.getByText(question, { exact: true })).not.toBeVisible();
});
