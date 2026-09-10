import { describe, expect, it } from "vitest";
import { createTwoRealUsers } from "./real-supabase";

// Smoke test for the real-Supabase test infrastructure itself (plan.md Phase
// 2), not a Risk #3/#4 assertion — proves createTwoRealUsers() actually
// creates two distinct, authenticated real users and cleans them up.
describe("createTwoRealUsers()", () => {
  it("creates two distinct, authenticated real Supabase users and cleans them up", async () => {
    const { userA, userB, cleanup } = await createTwoRealUsers();

    try {
      expect(userA.id).toBeTruthy();
      expect(userB.id).toBeTruthy();
      expect(userA.id).not.toBe(userB.id);

      const { data: sessionA } = await userA.client.auth.getSession();
      const { data: sessionB } = await userB.client.auth.getSession();
      expect(sessionA.session).not.toBeNull();
      expect(sessionB.session).not.toBeNull();
    } finally {
      await cleanup();
    }
  });
});
