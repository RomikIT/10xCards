import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Test-only connectivity check for the real-Supabase integration tier (plan.md
// Phase 2). Never imported by production code — SUPABASE_SERVICE_ROLE_KEY must
// not be added to .env.example or astro.config.mjs's env schema; obtain it
// locally via `npx supabase status`.
const CONNECTION_ERROR_MESSAGE =
  "Local Supabase is not reachable — run `npx supabase start` before running integration tests.";

export interface RealUser {
  client: SupabaseClient;
  id: string;
}

export interface RealSupabaseUsers {
  userA: RealUser;
  userB: RealUser;
  cleanup: () => Promise<void>;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${CONNECTION_ERROR_MESSAGE} (missing env var ${name})`);
  }
  return value;
}

async function signUpRealUser(url: string, anonKey: string): Promise<RealUser> {
  const client = createClient(url, anonKey);
  const email = `test-${crypto.randomUUID()}@example.com`;
  const password = "Test-password-123!";

  let result: Awaited<ReturnType<typeof client.auth.signUp>>;
  try {
    result = await client.auth.signUp({ email, password });
  } catch {
    // A rejected promise here means the fetch to the local API URL itself
    // failed (e.g. connection refused) rather than an auth-level error.
    throw new Error(CONNECTION_ERROR_MESSAGE);
  }

  const { data, error } = result;
  if (error || !data.user) {
    throw new Error(`${CONNECTION_ERROR_MESSAGE} (signUp failed: ${error?.message ?? "no user returned"})`);
  }

  return { client, id: data.user.id };
}

/**
 * Creates two distinct, freshly-signed-up real Supabase users against a local
 * instance (relies on `enable_confirmations = false` in supabase/config.toml
 * so signUp() returns an immediately-usable session). Each user's `client` is
 * a plain @supabase/supabase-js client authenticated as that user — pass it
 * directly to flashcards.service.ts / review.service.ts functions to exercise
 * real RLS. `cleanup()` removes both auth users via the admin API (their
 * flashcards rows cascade-delete via the FK's `on delete cascade`).
 */
export async function createTwoRealUsers(): Promise<RealSupabaseUsers> {
  const url = requiredEnv("SUPABASE_URL");
  const anonKey = requiredEnv("SUPABASE_KEY");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const adminClient = createClient(url, serviceRoleKey);

  const results = await Promise.allSettled([signUpRealUser(url, anonKey), signUpRealUser(url, anonKey)]);
  const succeeded = results
    .filter((result): result is PromiseFulfilledResult<RealUser> => result.status === "fulfilled")
    .map((result) => result.value);

  if (results.some((result) => result.status === "rejected")) {
    // One signup succeeded before the other failed — clean it up now so a
    // partial failure doesn't leave an orphaned auth user in local Supabase.
    await Promise.allSettled(succeeded.map((user) => adminClient.auth.admin.deleteUser(user.id)));
    const rejection = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    throw rejection?.reason instanceof Error ? rejection.reason : new Error(String(rejection?.reason));
  }

  const [userA, userB] = succeeded;

  return {
    userA,
    userB,
    cleanup: async () => {
      const outcomes = await Promise.allSettled([
        adminClient.auth.admin.deleteUser(userA.id),
        adminClient.auth.admin.deleteUser(userB.id),
      ]);
      for (const outcome of outcomes) {
        if (outcome.status === "rejected") {
          console.warn("[real-supabase] cleanup failed to delete a test user:", outcome.reason);
        }
      }
    },
  };
}
