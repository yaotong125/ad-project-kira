import "server-only";
import { cookies } from "next/headers";

/**
 * After a sign-up error, lejar.ai shows the form again with the email already filled in,
 * although the URL does not contain it (observed 2026-11-21). Kira keeps it the same way:
 * a short-lived, HttpOnly cookie that only the sign-up page reads.
 */
const NAME = "kira_signup_email";

export async function rememberSignupEmail(email: string): Promise<void> {
  if (!email) return;
  (await cookies()).set(NAME, email.slice(0, 320), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/signup",
    maxAge: 120,
  });
}

export async function forgetSignupEmail(): Promise<void> {
  (await cookies()).delete({ name: NAME, path: "/signup" });
}

export async function rememberedSignupEmail(): Promise<string> {
  return (await cookies()).get(NAME)?.value ?? "";
}
