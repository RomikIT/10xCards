import { defineMiddleware } from "astro:middleware";
import { callSupabaseAuth, createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = ["/dashboard"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const result = await callSupabaseAuth("middleware", () => supabase.auth.getUser());
    context.locals.user = result.ok ? (result.value.data.user ?? null) : null;
  } else {
    context.locals.user = null;
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  return next();
});
