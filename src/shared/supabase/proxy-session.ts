import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasAcceptedTerms } from "@/shared/auth/terms-key";
import { supabaseEnv } from "./env";

export type SessionClaims = { sub: string; email?: string; user_metadata?: Record<string, unknown> };

/**
 * Refreshes the Supabase session cookies on every request and returns the signed-in user's
 * verified token claims (null when signed out). Runs in src/proxy.ts.
 *
 * Token claims are a snapshot: user metadata saved after the token was issued (the Terms
 * acceptance, possibly from another device or a request whose new cookie did not reach the
 * browser) is missing from them. When the token has no Terms date, the auth server is asked
 * once; if the date is there, the session is refreshed so the browser gets an up-to-date token.
 */
export async function updateSession(request: NextRequest): Promise<{ response: NextResponse; claims: SessionClaims | null }> {
  let response = NextResponse.next({ request });
  const env = supabaseEnv();
  if (!env) return { response, claims: null };

  const supabase = createServerClient(env.url, env.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // getClaims() verifies the JWT; do not trust getSession() on the server.
  const { data } = await supabase.auth.getClaims();
  let claims = data?.claims?.sub ? (data.claims as unknown as SessionClaims) : null;

  if (claims && !hasAcceptedTerms(claims.user_metadata)) {
    const { data: fresh } = await supabase.auth.getUser();
    if (fresh.user && hasAcceptedTerms(fresh.user.user_metadata)) {
      await supabase.auth.refreshSession();
      claims = { ...claims, user_metadata: fresh.user.user_metadata };
    }
  }
  return { response, claims };
}
