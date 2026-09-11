import { test, expect } from "@playwright/test";

// risk: test-plan.md #6 — an unauthenticated visitor must never reach
// protected page content; the routing-level auth gate (middleware.ts
// PROTECTED_ROUTES) must redirect to /auth/signin on every matching route
// seed: tests/e2e/seed.spec.ts
//
// Real vs mocked boundary: nothing mocked — auth, routing, and the
// middleware's session check are all real. This spec deliberately runs
// with an anonymous (logged-out) context, unlike every other spec in this
// project, which is why it overrides storageState below.

test.use({ storageState: { cookies: [], origins: [] } });

test("unauthenticated visitor is redirected to /auth/signin from every protected route", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL("/auth/signin");

  await page.goto("/flashcards");
  await expect(page).toHaveURL("/auth/signin");

  // Covers the PROTECTED_ROUTES prefix match (middleware.ts:16), not just
  // the exact "/flashcards" entry — test-plan.md #6 names this gap
  // explicitly: the list is hand-maintained, not derived from the route tree.
  await page.goto("/flashcards/generate");
  await expect(page).toHaveURL("/auth/signin");
});
