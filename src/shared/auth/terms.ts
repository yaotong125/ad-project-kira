import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { TERMS_KEY, hasAcceptedTerms } from "./terms-key";

/**
 * When a user accepted the Terms of Service and Privacy Policy, kept in Supabase user metadata
 * (`user_metadata.terms_accepted_at`). Set by:
 * - email sign-up (sent with the sign-up request),
 * - "Sign up with Google" on /signup (recorded in /auth/callback),
 * - the one-time /auth/terms page, which every signed-in account without it must pass through
 *   (Google from /login, users added in the Supabase dashboard, older accounts).
 */
export { TERMS_KEY, hasAcceptedTerms };

export function termsMetadata(): Record<string, string> {
  return { [TERMS_KEY]: new Date().toISOString() };
}

/**
 * Saves the acceptance time unless the account already has one (never overwrites the original),
 * then refreshes the session: the access token carries user metadata, and the proxy reads the
 * token, so without a fresh token it would keep sending the user to /auth/terms.
 */
export async function recordTermsIfMissing(supabase: SupabaseClient, user: User | null | undefined): Promise<boolean> {
  if (!user) return false;
  if (!hasAcceptedTerms(user.user_metadata)) {
    const { error } = await supabase.auth.updateUser({ data: termsMetadata() });
    if (error) {
      console.warn("[auth] could not record Terms acceptance:", error.code ?? error.status, error.message);
      return false;
    }
  }
  const { error } = await supabase.auth.refreshSession();
  if (error) console.warn("[auth] could not refresh the session after the Terms:", error.code ?? error.status, error.message);
  return true;
}
