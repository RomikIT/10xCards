import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { AstroCookies } from "astro";
import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";

export function createClient(requestHeaders: Headers, cookies: AstroCookies) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return null;
  }
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(requestHeaders.get("Cookie") ?? "").map(({ name, value }) => ({
          name,
          value: value ?? "",
        }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookies.set(name, value, options);
        });
      },
    },
  });
}

export const GENERIC_AUTH_ERROR_MESSAGE = "Something went wrong. Please try again.";

export async function callSupabaseAuth<T>(
  routeLabel: string,
  fn: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    const value = await fn();
    return { ok: true, value };
  } catch (error) {
    console.error(`[auth:${routeLabel}]`, error);
    return { ok: false };
  }
}
