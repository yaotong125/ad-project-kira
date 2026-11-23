"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { back, callbackUrl } from "./form-redirect";
import { safeNext } from "./next-path";

/**
 * "Continue with Google" (/login) and "Sign up with Google" (/signup): lejar.ai posts both
 * to the same Server Action, with `returnTo` naming the page to come back to on failure.
 * Starts Supabase's Google OAuth flow (PKCE) and leaves for Google.
 */
export async function signInWithGoogle(form: FormData): Promise<void> {
  const returnTo = form.get("returnTo") === "/signup" ? "/signup" : "/login";
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    // From /signup the button sits above "By continuing with Google, you agree to the Terms…",
    // so the callback records the acceptance (Kira addition; Lejar's handling is not visible).
    options: { redirectTo: await callbackUrl(safeNext(form.get("next")), { terms: returnTo === "/signup" }) },
  });
  if (error || !data.url) {
    console.warn("[auth] Google sign-in could not start:", error?.code ?? error?.status, error?.message);
    back(returnTo, form, { error: "google_failed" });
  }
  redirect(data.url);
}
