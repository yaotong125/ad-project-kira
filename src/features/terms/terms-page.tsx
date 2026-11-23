import Link from "next/link";
import { signOut } from "@/features/sign-in/sign-out";
import { safeNext } from "@/shared/auth/next-path";
import { errorText } from "@/shared/auth/notices";
import { first, type Lang, type SearchParams } from "@/shared/i18n";
import { AuthBanner } from "@/shared/ui/auth-banner";
import { AuthCard } from "@/shared/ui/auth-card";
import { KiraLogo } from "@/shared/ui/kira-logo";
import { SubmitButton } from "@/shared/ui/submit-button";
import { acceptTerms } from "./actions";
import { TERMS_COPY } from "./copy";

const LINK = "text-ink underline-offset-2 hover:underline";

/**
 * /auth/terms: one-time Terms acceptance for accounts that never saw the sign-up checkbox.
 * Same frame and classes as the other auth cards; the checkbox copies /signup's.
 */
export function TermsPage({ lang, searchParams, email }: { lang: Lang; searchParams: SearchParams; email: string }) {
  const t = TERMS_COPY[lang];
  const ms = lang === "ms" ? "ms" : undefined;
  const next = safeNext(first(searchParams.next));
  const error = errorText(first(searchParams.error), lang);

  return (
    <main lang={lang} className="flex min-h-dvh flex-col items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex justify-center">
          <KiraLogo lang={lang} />
        </div>

        <AuthCard>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">{t.title}</h1>
          <p className="mt-1 text-[13px] text-muted">{t.subtitle}</p>
          {error && <AuthBanner kind="error">{error}</AuthBanner>}
          <div className="mt-5">
            {email && (
              <p className="mb-4 text-[13px] text-muted">
                {t.signedInAs} <span className="font-medium text-ink-2">{email}</span>
              </p>
            )}
            <form className="flex flex-col gap-3.5" action={acceptTerms}>
              <input type="hidden" name="next" value={next} />
              {ms && <input type="hidden" name="lang" value="ms" />}
              <label className="flex items-start gap-2 text-[13px] text-muted">
                <input type="checkbox" name="tos" required autoFocus className="mt-0.5 h-4 w-4 shrink-0 accent-brand" />
                <span>
                  {t.agreePrefix}{" "}
                  <Link className={LINK} href="/terms">
                    {t.terms}
                  </Link>{" "}
                  {t.and}{" "}
                  <Link className={LINK} href="/privacy">
                    {t.privacy}
                  </Link>
                  .
                </span>
              </label>
              <p className="-mt-1.5 pl-6 text-[12px] leading-[1.5] text-muted">{t.tips}</p>
              <SubmitButton variant="primary" size="lg">
                {t.continue}
              </SubmitButton>
            </form>
          </div>
        </AuthCard>

        <form action={signOut} className="mt-5 text-center text-[13px] text-muted">
          {t.notYou}{" "}
          <button type="submit" className="font-medium text-ink underline-offset-2 hover:underline">
            {t.signOut}
          </button>
        </form>
      </div>
    </main>
  );
}
