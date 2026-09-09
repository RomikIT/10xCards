import type { APIRoute } from "astro";
import { callSupabaseAuth, createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (supabase) {
    await callSupabaseAuth("signout", () => supabase.auth.signOut());
  }
  return context.redirect("/");
};
