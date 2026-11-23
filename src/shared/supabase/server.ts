import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { SupabaseNotConfiguredError, supabaseEnv } from "./env";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Create one per request: the auth session lives in cookies (PKCE flow).
 */
export async function createSupabaseServerClient() {
  // Mark the caller as per-request before anything else: the auth client reads the clock
  // (token expiry via Date.now()), which Next.js refuses during prerendering.
  await connection();
  const cookieStore = await cookies();
  const env = supabaseEnv();
  if (!env) throw new SupabaseNotConfiguredError();
  return createServerClient(env.url, env.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The proxy refreshes the session cookies on the next request instead.
        }
      },
    },
  });
}
