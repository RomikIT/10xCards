import type { APIRoute } from "astro";
import { callSupabaseAuth, createClient, GENERIC_AUTH_ERROR_MESSAGE } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;
  const password = form.get("password") as string;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Supabase is not configured")}`);
  }
  const result = await callSupabaseAuth("signin", () => supabase.auth.signInWithPassword({ email, password }));
  if (!result.ok) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent(GENERIC_AUTH_ERROR_MESSAGE)}`);
  }
  const { error } = result.value;

  if (error) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent(error.message)}`);
  }

  return context.redirect("/");
};
