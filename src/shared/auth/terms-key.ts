/** Name of the Terms acceptance field in Supabase user metadata (no server-only deps: used by the proxy). */
export const TERMS_KEY = "terms_accepted_at";

export function hasAcceptedTerms(metadata: unknown): boolean {
  return Boolean(metadata && typeof metadata === "object" && (metadata as Record<string, unknown>)[TERMS_KEY]);
}
