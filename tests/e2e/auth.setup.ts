import { test as setup, expect } from "@playwright/test";
import { fillAllWhenHydrated } from "./helpers";

const authFile = "playwright/.auth/user.json";

setup("authenticate", async ({ page }) => {
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "E2E_USER_EMAIL / E2E_USER_PASSWORD are not set. Copy .env.test.example to .env.test and fill in a real account.",
    );
  }

  await page.goto("/auth/signin");
  // SignInForm is a client:load React island — fillAllWhenHydrated verifies
  // both fields together at the end of each attempt, so a field wiped by a
  // delayed hydration event (after its own fill already looked fine) still
  // triggers a full retry (see helpers.ts).
  await fillAllWhenHydrated([
    [page.getByLabel("Email", { exact: true }), email],
    [page.getByLabel("Password", { exact: true }), password],
  ]);
  await page.getByRole("button", { name: "Sign in" }).click();

  // A failed sign-in re-renders /auth/signin with ?error=...; success redirects to "/".
  await page.waitForURL("/");

  // Confirm the session actually authorizes a protected route, not just that
  // the redirect happened — this is what every later E2E test relies on.
  await page.goto("/dashboard");
  await expect(page).toHaveURL("/dashboard");

  await page.context().storageState({ path: authFile });
});
