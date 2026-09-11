import { test, expect } from "@playwright/test";
import { fillAllWhenHydrated } from "./helpers";

// Seed test — the exemplar every /10x-e2e-generated test is modeled on.
// Demonstrates: role/label-based locators, wait-for-state (not time), a
// self-contained setup → action → assertion → cleanup cycle, unique test
// data (Date.now()), and a name tied to a real risk: a flashcard the user
// created must still be there after a reload, not just right after saving.

test("manually created flashcard persists after page reload", async ({ page }) => {
  const question = `E2E question ${Date.now()}`;
  const answer = `E2E answer ${Date.now()}`;

  await page.goto("/flashcards");
  const addButton = page.getByRole("button", { name: "Add flashcard" });
  // CreateFlashcardForm is a client:load React island — fillAllWhenHydrated
  // retries filling both fields until the button's enabled state (driven by
  // React state, not raw DOM value) confirms the update really landed.
  await fillAllWhenHydrated(
    [
      [page.getByLabel("Question", { exact: true }), question],
      [page.getByLabel("Answer", { exact: true }), answer],
    ],
    () => expect(addButton).toBeEnabled(),
  );

  // POST /api/flashcards round-trips to Supabase Cloud (auth check on every
  // route) — wait for that response explicitly rather than racing it against
  // toBeVisible()'s default 5s, which flakes on a slow/cold connection.
  const createResponse = page.waitForResponse(
    (r) => r.url().includes("/api/flashcards") && r.request().method() === "POST",
  );
  await addButton.click();
  await createResponse;

  await expect(page.getByText(question, { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText(question, { exact: true })).toBeVisible();

  // Cleanup — delete the flashcard this test created so re-runs (and other
  // tests sharing this account) stay isolated. The card wrapper has no
  // dedicated role, so scope by the unique question text instead of index.
  const card = page.getByText(question, { exact: true }).locator("xpath=..");

  // DialogContent renders via a Portal (outside `card` in the DOM), so the
  // confirm button is scoped through the dialog role, not through `card` —
  // that also avoids matching the now-hidden trigger button of the same name.
  const dialog = page.getByRole("dialog");
  // Opening the dialog occasionally doesn't register from a single click
  // (Radix's open-state transition, not a locator/timing issue this project
  // controls) — retry the trigger click against the real "is it open?" state
  // instead of assuming one click always lands.
  await expect(async () => {
    if ((await dialog.count()) === 0) {
      await card.getByRole("button", { name: "Delete" }).click();
    }
    await expect(dialog).toBeVisible();
  }).toPass({ timeout: 10_000 });
  await dialog.getByRole("button", { name: "Delete" }).click();

  await expect(page.getByText(question, { exact: true })).not.toBeVisible();
});
