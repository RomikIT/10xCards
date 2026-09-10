import { describe, expect, it } from "vitest";
import type { AstroCookies } from "astro";
import { createClient } from "@/lib/supabase";

describe("Vitest bootstrap", () => {
  it("resolves the @/* alias and astro:env/server, returning null when SUPABASE_URL/SUPABASE_KEY are unset", () => {
    // No .env file exists in this repo and no test-mode env vars are stubbed here,
    // so this also proves astro:env/server's "optional: true" fields surface as
    // falsy in the Vitest process rather than throwing — see plan.md's "Critical
    // Implementation Details" for why this assertion is the load-bearing check.
    const result = createClient(new Headers(), {} as AstroCookies);

    expect(result).toBeNull();
  });
});
