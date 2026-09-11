import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({ path: ".env.test" });

const baseURL = "http://localhost:4321";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "playwright/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    // Build + preview, not `npm run dev`: runs the same server-rendered
    // output CI/prod would serve, without Vite's dev-mode overhead — closer
    // to what these tests are meant to protect. (The client:load hydration
    // races these tests guard against, see context/foundation/lessons.md,
    // turned out to reproduce under either command — this switch didn't fix
    // that on its own, but testing against a prod-like build is still the
    // better default.)
    command: "npm run build && npm run preview",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
