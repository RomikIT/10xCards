import { test as setup, expect } from "@playwright/test";

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
  // SignInForm is a client:load React island — same hydration race as the
  // flashcards form (see seed.spec.ts): fill too early and the controlled
  // input's value is wiped when React mounts. Wait for the island's JS to
  // finish loading first.
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  // A failed sign-in re-renders /auth/signin with ?error=...; success redirects to "/".
  await page.waitForURL("/");

  // Confirm the session actually authorizes a protected route, not just that
  // the redirect happened — this is what every later E2E test relies on.
  await page.goto("/dashboard");
  await expect(page).toHaveURL("/dashboard");

  await page.context().storageState({ path: authFile });
});
