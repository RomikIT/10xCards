import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// RTL's auto-cleanup only self-registers when `test.globals: true` is set; this
// project keeps explicit `vitest` imports instead, so unmount rendered components
// after every test here rather than per test file.
afterEach(() => {
  cleanup();
});
