"use server";

import { redirect } from "next/navigation";
import { back, callbackUrl, formPassword, formText } from "@/shared/auth/form-redirect";
import { safeNext } from "@/shared/auth/next-path";
import { forgetSignupEmail, rememberSignupEmail } from "@/shared/auth/remembered-email";
import { termsMetadata } from "@/shared/auth/terms";
import { createSupabaseServerClient } from "@/shared/supabase/server";

/**
 * Sign-up Server Actions. lejar.ai's /signup form posts to two actions (one per submit
 * button); "Sign up with Google" uses the shared Google action. Observed results:
 * no password → /signup?error=password_missing (email kept in the form). The browser itself
 * blocks submits without the Terms box ticked (required) or with a password under 8
 * characters (minlength). Success paths were not run on lejar.ai (they would create a real
 * account); they follow the pages lejar.ai has for them: /signup?notice=link_sent
 * ("Check your email") and /auth/confirm ("Confirm your email").
 */

const MIN_PASSWORD = 8;

/** Common checks; returns the email or redirects back with an error. */
async function checkCommon(form: FormData): Promise<string> {
  const email = formText(form, "email");
  if (!email) back("/signup", form, { error: "email_missing" });
  await rememberSignupEmail(email);
  // The checkbox is `required` in the browser; check again here (Kira addition).
  if (form.get("tos") !== "on") back("/signup", form, { error: "terms_required" });
  return email;
}

/** "Send sign-in link": creates the account if needed and emails a one-time link. */
export async function sendSignupLink(form: FormData): Promise<void> {
  const email = await checkCommon(form);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: await callbackUrl(safeNext(form.get("next"))),
      shouldCreateUser: true,
      data: termsMetadata(),
    },
  });
  if (error) {
    console.warn("[sign-up] sign-in link failed:", error.code ?? error.status, error.message);
    back("/signup", form, { error: error.code === "email_address_invalid" ? "email_invalid" : "link_failed" });
  }
  await forgetSignupEmail();
  back("/signup", form, { notice: "link_sent" });
}

/** "Create account": email + password sign-up (Supabase signUp). */
export async function createAccount(form: FormData): Promise<void> {
  const email = await checkCommon(form);
  const password = formPassword(form);
  if (!password) back("/signup", form, { error: "password_missing" });
  if (password.length < MIN_PASSWORD) back("/signup", form, { error: "password_short" });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: await callbackUrl(safeNext(form.get("next"))), data: termsMetadata() },
  });
  if (error) {
    const code =
      error.code === "user_already_exists" || error.code === "email_exists"
        ? "account_exists"
        : error.code === "weak_password"
          ? "weak_password"
          : error.code === "email_address_invalid"
            ? "email_invalid"
            : "signup_failed";
    if (code === "signup_failed") console.warn("[sign-up] sign-up failed:", error.code ?? error.status, error.message);
    back("/signup", form, { error: code });
  }
  // With email confirmation on, Supabase hides existing accounts by returning a user with no identities.
  if (!data.session && data.user && data.user.identities?.length === 0) back("/signup", form, { error: "account_exists" });

  await forgetSignupEmail();
  if (data.session) redirect(safeNext(form.get("next"))); // email confirmation turned off in Supabase
  back("/auth/confirm", form, undefined, false);
}

/** /auth/confirm "Resend confirmation link" (Supabase resend, type signup). */
export async function resendConfirmation(form: FormData): Promise<void> {
  const email = formText(form, "email");
  if (!email) back("/auth/confirm", form, { error: "email_missing" }, false);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: await callbackUrl(safeNext(form.get("next"))) },
  });
  if (error) {
    console.warn("[sign-up] resend failed:", error.code ?? error.status, error.message);
    back("/auth/confirm", form, { error: error.code === "email_address_invalid" ? "email_invalid" : "link_failed" }, false);
  }
  // Same answer whether or not the email has an account, as on lejar.ai.
  back("/auth/confirm", form, { notice: "confirm_sent" }, false);
}
