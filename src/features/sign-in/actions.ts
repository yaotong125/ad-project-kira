"use server";

import { redirect } from "next/navigation";
import { back, callbackUrl, formPassword, formText } from "@/shared/auth/form-redirect";
import { safeNext } from "@/shared/auth/next-path";
import { createSupabaseServerClient } from "@/shared/supabase/server";

/**
 * Sign-in Server Actions. lejar.ai posts the login form to two actions (one per submit
 * button); Google is shared with sign-up (src/shared/auth/google.ts).
 */

/** "Send magic link": emails a one-time sign-in link (Supabase signInWithOtp). */
export async function sendMagicLink(form: FormData): Promise<void> {
  const email = formText(form, "email");
  if (!email) back("/login", form, { error: "email_missing" });

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: await callbackUrl(safeNext(form.get("next"))),
      // Signing up happens on /signup (it asks for the Terms first), so the login page
      // never creates accounts. Assumption: lejar.ai does not show which applies.
      shouldCreateUser: false,
    },
  });
  if (error) {
    console.warn("[sign-in] magic link failed:", error.code ?? error.status, error.message);
    back("/login", form, { error: "link_failed" });
  }
  back("/login", form, { notice: "link_sent" });
}

/** "Sign in with password" (Supabase signInWithPassword). */
export async function signInWithPassword(form: FormData): Promise<void> {
  const email = formText(form, "email");
  const password = formPassword(form);
  if (!email || !password) back("/login", form, { error: "credentials_missing" });

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Wrong password, unknown email and unconfirmed email all read "Invalid email or password."
    // (the page then suggests confirming the email), so the form never reveals which accounts exist.
    if (error.code !== "invalid_credentials" && error.code !== "email_not_confirmed") {
      console.warn("[sign-in] password sign-in failed:", error.code ?? error.status, error.message);
    }
    back("/login", form, { error: "invalid_credentials" });
  }
  redirect(safeNext(form.get("next")));
}
