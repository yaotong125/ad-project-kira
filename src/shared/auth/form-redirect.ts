import "server-only";
import { redirect } from "next/navigation";
import { DEFAULT_NEXT, safeNext } from "./next-path";
import type { AuthErrorCode, AuthNoticeCode } from "./notices";
import { siteOrigin } from "./origin";
import { href, resolveLang } from "@/shared/i18n";

/**
 * Helpers shared by the auth Server Actions. lejar.ai answers every auth form with a
 * redirect that carries the result in the URL (`?error=<code>` / `?notice=<code>`),
 * keeping `lang` and a non-default `next`.
 */

export type Outcome = { error: AuthErrorCode } | { notice: AuthNoticeCode };

export function back(page: string, form: FormData, outcome?: Outcome, keepNext = true): never {
  const lang = resolveLang(form.get("lang"));
  const next = safeNext(form.get("next"));
  redirect(
    href(page, {
      lang: lang === "ms" ? "ms" : undefined,
      next: keepNext && next !== DEFAULT_NEXT ? next : undefined,
      ...(outcome ? ("error" in outcome ? { error: outcome.error } : { notice: outcome.notice }) : {}),
    }),
  );
}

export function formText(form: FormData, name: string): string {
  const v = form.get(name);
  return typeof v === "string" ? v.trim() : "";
}

/** Raw (untrimmed) password field. */
export function formPassword(form: FormData, name = "password"): string {
  const v = form.get(name);
  return typeof v === "string" ? v : "";
}

/**
 * Where Supabase sends the user back after a magic link, confirmation link or Google.
 * `terms` marks a sign-in started from /signup, where the Terms text is shown (see /auth/callback).
 */
export async function callbackUrl(next: string, opts: { terms?: boolean } = {}): Promise<string> {
  const terms = opts.terms ? "&terms=1" : "";
  return `${await siteOrigin()}/auth/callback?next=${encodeURIComponent(next)}${terms}`;
}
