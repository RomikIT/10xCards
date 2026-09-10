// Stand-in for Astro's `astro:env/server` virtual module in the Vitest process.
//
// getViteConfig() (Astro's documented Vitest setup) cannot be used in this repo:
// @cloudflare/vite-plugin (pulled in via astro.config.mjs's `adapter: cloudflare()`)
// rejects Vitest's default `resolve.external` for the "ssr" environment at startup
// ("The following environment options are incompatible with the Cloudflare Vite
// plugin"), with no working override found via getViteConfig()'s inlineAstroConfig
// argument. Aliasing this bare specifier (see vitest.config.ts) sidesteps loading
// the Cloudflare plugin in the test process entirely.
//
// Mirrors astro.config.mjs's env.schema (all three fields: server, secret, optional)
// by reading directly from process.env. Update this file if that schema changes.
export const SUPABASE_URL = process.env.SUPABASE_URL;
export const SUPABASE_KEY = process.env.SUPABASE_KEY;
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
