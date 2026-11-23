import Link from "next/link";
import { DEFAULT_NEXT, safeNext } from "@/shared/auth/next-path";
import { errorText, noticeText } from "@/shared/auth/notices";
import { first, href, type Lang, type SearchParams } from "@/shared/i18n";
import { AuthBanner } from "@/shared/ui/auth-banner";
import { Field } from "@/shared/ui/field";
import { GoogleIcon } from "@/shared/ui/google-icon";
import { AuthCard } from "@/shared/ui/auth-card";
import { KiraLogo } from "@/shared/ui/kira-logo";
import { LanguageNav } from "@/shared/ui/language-nav";
import { SubmitButton } from "@/shared/ui/submit-button";
import { signInWithGoogle } from "@/shared/auth/google";
import { sendMagicLink, signInWithPassword } from "./actions";
import { LOGIN_COPY } from "./copy";

/**
 * /login: layout and classes follow lejar.ai's server-rendered sign-in page (REA capture,
 * 2026-11-21, 1440x900); colours, logo and font are Kira's.
 */
export function LoginPage({ lang, searchParams }: { lang: Lang; searchParams: SearchParams }) {
  const t = LOGIN_COPY[lang];
  const nextParam = first(searchParams.next);
  const next = safeNext(nextParam);
  const linkNext = nextParam && next !== DEFAULT_NEXT ? next : undefined;
  const ms = lang === "ms" ? "ms" : undefined;
  const error = errorText(first(searchParams.error), lang);
  const notice = error ? null : noticeText(first(searchParams.notice), lang);

  return (
    <main lang={lang} className="flex min-h-dvh flex-col items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-[400px]">
        <div className="mb-2 flex justify-end">
          <LanguageNav path="/login" lang={lang} searchParams={searchParams} />
        </div>
        <div className="mb-6 flex justify-center">
          <KiraLogo lang={lang} />
        </div>

        <AuthCard>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">{t.title}</h1>
          <p className="mt-1 text-[13px] text-muted">{t.subtitle}</p>
          {error && <AuthBanner kind="error">{error}</AuthBanner>}
          {notice && <AuthBanner kind="notice">{notice}</AuthBanner>}

          <div className="mt-5">
            {error && (
              <p className="mb-3 text-[12px] leading-[1.5] text-muted">
                {t.confirmHint}{" "}
                <Link className="text-ink underline-offset-2 hover:underline" href={href("/auth/confirm", { lang: ms })}>
                  {t.confirmLink}
                </Link>
                .
              </p>
            )}

            <form className="flex flex-col gap-3.5">
              <input type="hidden" name="next" value={next} />
              {ms && <input type="hidden" name="lang" value="ms" />}
              <Field
                id="email"
                label={t.email}
                type="email"
                name="email"
                required
                autoFocus={!error}
                autoComplete="email"
                placeholder={t.emailPlaceholder}
              />
              <SubmitButton formAction={sendMagicLink} variant="primary" size="lg">
                {t.sendMagicLink}
              </SubmitButton>
              <div className="my-0.5 flex items-center gap-3 text-[12px] text-muted">
                <span className="h-px flex-1 bg-border" />
                {t.or}
                <span className="h-px flex-1 bg-border" />
              </div>
              <Field
                id="password"
                label={t.password}
                type="password"
                name="password"
                autoComplete="current-password"
                placeholder={t.passwordPlaceholder}
              />
              <SubmitButton formAction={signInWithPassword} variant="primary" size="lg">
                {t.signInWithPassword}
              </SubmitButton>
              <Link
                className="self-start text-[13px] text-muted underline-offset-2 transition-colors hover:text-ink hover:underline"
                href={href("/auth/forgot", { next: linkNext, lang: ms })}
              >
                {t.forgotPassword}
              </Link>
            </form>

            <div className="my-5 h-px bg-border" />

            <form action={signInWithGoogle}>
              <input type="hidden" name="next" value={next} />
              <input type="hidden" name="returnTo" value="/login" />
              {ms && <input type="hidden" name="lang" value="ms" />}
              <SubmitButton variant="primary" size="lg" className="w-full">
                <GoogleIcon />
                {t.continueWithGoogle}
              </SubmitButton>
            </form>
          </div>
        </AuthCard>

        <div className="mt-5 text-center text-[13px] text-muted">
          {t.newHere}{" "}
          <Link className="font-medium text-ink underline-offset-2 hover:underline" href={href("/signup", { lang: ms, next: linkNext })}>
            {t.createAccount}
          </Link>
        </div>
      </div>
    </main>
  );
}
