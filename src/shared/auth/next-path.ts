/** Where a user lands after signing in when no `next` was given (lejar.ai uses /post-auth). */
export const DEFAULT_NEXT = "/post-auth";

/**
 * Accepts only same-site absolute paths ("/new-org"), so `next` can never send a
 * user to another website after sign-in ("//evil.com", "https://…", "/\\evil").
 */
export function safeNext(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return DEFAULT_NEXT;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return DEFAULT_NEXT;
  if (/[\u0000-\u001f]/.test(value)) return DEFAULT_NEXT;
  return value;
}
