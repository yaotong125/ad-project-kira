"use server";

import { back, callbackUrl, formPassword, formText } from "@/shared/auth/form-redirect";
import { createSupabaseServerClient } from "@/shared/supabase/server";

const MIN_PASSWORD = 8;

/** /auth/forgot: send a Supabase password-recovery email redirecting back through /auth/callback?next=/auth/reset. */
export async function requestPasswordReset(form: FormData): Promise<void> {
  const email = formText(form, "email");
  if (!email) back("/auth/forgot", form, { error: "email_missing" }, false);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: await callbackUrl("/auth/reset"),
  });
  if (error) {
    console.warn("[auth-recovery] reset link failed:", error.code ?? error.status, error.message);
    back("/auth/forgot", form, { error: error.code === "email_address_invalid" ? "email_invalid" : "link_failed" }, false);
  }
  back("/auth/forgot", form, { notice: "reset_sent" }, false);
}

/** /auth/reset: update the signed-in recovery user's password and return to /login?notice=password_updated. */
export async function completePasswordReset(form: FormData): Promise<void> {
  const password = formPassword(form);
  const confirm = form.get("confirmPassword");
  const confirmStr = typeof confirm === "string" ? confirm : "";

  if (!password || password.length < MIN_PASSWORD) {
    back("/auth/reset", form, { error: "password_short" }, false);
  }
  if (password !== confirmStr) {
    back("/auth/reset", form, { error: "password_mismatch" }, false);
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    back("/auth/forgot", form, { error: "reset_link_needed" }, false);
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    const code = error.code === "weak_password" ? "weak_password" : "reset_failed";
    if (code === "reset_failed") console.warn("[auth-recovery] update password failed:", error.code ?? error.status, error.message);
    back("/auth/reset", form, { error: code }, false);
  }

  back("/login", form, { notice: "password_updated" }, false);
}
