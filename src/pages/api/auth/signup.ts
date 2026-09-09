import type { APIRoute } from "astro";
import { callSupabaseAuth, createClient, GENERIC_AUTH_ERROR_MESSAGE } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  let form: FormData;
  try {
    form = await context.request.formData();
  } catch (error) {
    console.error("[auth:signup] formData parse failed", error);
    return context.redirect(`/auth/signup?error=${encodeURIComponent(GENERIC_AUTH_ERROR_MESSAGE)}`);
  }
  const email = form.get("email") as string;
  const password = form.get("password") as string;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signup?error=${encodeURIComponent("Supabase is not configured")}`);
  }
  const result = await callSupabaseAuth("signup", () => supabase.auth.signUp({ email, password }));
  if (!result.ok) {
    return context.redirect(`/auth/signup?error=${encodeURIComponent(GENERIC_AUTH_ERROR_MESSAGE)}`);
  }
  const { error } = result.value;

  if (error) {
    return context.redirect(`/auth/signup?error=${encodeURIComponent(error.message)}`);
  }

  return context.redirect("/auth/confirm-email");
};
