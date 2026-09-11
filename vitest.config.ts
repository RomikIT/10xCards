import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

// NOTE: intentionally NOT using Astro's documented getViteConfig() helper here.
// See vitest.astro-env-server.stub.ts for why (@cloudflare/vite-plugin rejects
// Vitest's default SSR environment options and blocks startup). This config
// hand-rolls only what these tests need: the `@/*` tsconfig alias and a stub
// for the `astro:env/server` virtual module.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "astro:env/server": fileURLToPath(new URL("./vitest.astro-env-server.stub.ts", import.meta.url)),
    },
  },
  test: {
    // Default environment is "node"; component test files (*.test.tsx) opt into
    // jsdom individually via a `// @vitest-environment jsdom` docblock at the top
    // of the file — Vitest 5 removed `environmentMatchGlobs`, so this per-file
    // control comment is the current documented mechanism (Context7,
    // vitest-dev/vitest v4.1.6, docs/guide/environment.md).
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // tests/e2e/**/*.spec.ts are Playwright specs, not Vitest ones — Vitest's
    // default include glob matches *.spec.ts too, so they must be excluded
    // explicitly or `vitest`/lint-staged's `vitest related` tries to collect
    // them and fails with "did not expect test() to be called here".
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
  },
});
