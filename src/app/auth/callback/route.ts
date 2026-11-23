import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/shared/auth/next-path";
import { siteOrigin } from "@/shared/auth/origin";
import { recordTermsIfMissing } from "@/shared/auth/terms";
import { createSupabaseServerClient } from "@/shared/supabase/server";

/**
 * Where magic links and Google send the user back (lejar.ai: /auth/callback?next=…).
 * Observed: opening it without a code redirects to /login?error=link_invalid.
 * Accepts the PKCE `code` (Google, magic link) and `token_hash` + `type` (custom email templates).
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNext(url.searchParams.get("next"));
  const origin = await siteOrigin();
  const fail = (code: "link_invalid" | "link_expired") => NextResponse.redirect(new URL(`/login?error=${code}`, origin));

  // Supabase reports a failed verification in the query (or hash), e.g. error_code=otp_expired.
  const errorCode = url.searchParams.get("error_code") ?? url.searchParams.get("error");
  if (errorCode) return fail(errorCode.includes("expired") ? "link_expired" : "link_invalid");

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  if (!code && !(tokenHash && type)) return fail("link_invalid");

  const supabase = await createSupabaseServerClient();
  const { data, error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: type! });
  if (error) {
    console.warn("[auth/callback] sign-in link rejected:", error.code ?? error.status, error.message);
    return fail(error.code === "otp_expired" || error.code === "flow_state_expired" ? "link_expired" : "link_invalid");
  }

  // "Sign up with Google" on /signup (`terms=1`): the page says continuing means agreeing to the Terms.
  if (url.searchParams.get("terms") === "1") await recordTermsIfMissing(supabase, data.user);

  return NextResponse.redirect(new URL(next, origin));
}
