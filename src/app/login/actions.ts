"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string };

/** Old login emails that still sign in to an account whose email has changed. */
const LOGIN_ALIASES: Record<string, string> = {
  "demo1@yahawater.in": "shiva@jskengg.com",
};

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const typed = String(formData.get("email") ?? "").trim();
  const email = LOGIN_ALIASES[typed.toLowerCase()] ?? typed;
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/") || "/";

  if (!typed || !password) return { error: "Email and password are required." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  redirect(next.startsWith("/") ? next : "/");
}
