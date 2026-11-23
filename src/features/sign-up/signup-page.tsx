import Link from "next/link";
import { signInWithGoogle } from "@/shared/auth/google";
import { DEFAULT_NEXT, safeNext } from "@/shared/auth/next-path";
import { errorText, noticeText } from "@/shared/auth/notices";
import { first, href, type Lang, type SearchParams } from "@/shared/i18n";
import { AuthBanner } from "@/shared/ui/auth-banner";
import { AuthCard } from "@/shared/ui/auth-card";
import { Field } from "@/shared/ui/field";
import { GoogleIcon } from "@/shared/ui/google-icon";
import { KiraLogo } from "@/shared/ui/kira-logo";
import { LanguageNav } from "@/shared/ui/language-nav";
import { SubmitButton } from "@/shared/ui/submit-button";
import { createAccount, sendSignupLink } from "./actions";
import { SIGNUP_COPY } from "./copy";

const LINK = "text-ink underline-offset-2 hover:underline";

/**
 * /signup: layout and classes follow lejar.ai's server-rendered sign-up page (REA capture,
 * 2026-11-21, 1440x900); colours, logo, font and background are Kira's.
 * `?notice=link_sent` swaps the form for lejar.ai's "Check your email" card.
 */
export function SignupPage({
  lang,
  searchParams,
  rememberedEmail,
}: {
  lang: Lang;
  searchParams: SearchParams;
  rememberedEmail: string;
}) {
  const t = SIGNUP_COPY[lang];
  const nextParam = first(searchParams.next);
  const next = safeNext(nextParam);
  const linkNext = nextParam && next !== DEFAULT_NEXT ? next : undefined;
  const ms = lang === "ms" ? "ms" : undefined;
  const error = errorText(first(searchParams.error), lang);
  const sent = !error && first(searchParams.notice) === "link_sent";
  const notice = error || sent ? null : noticeText(first(searchParams.notice), lang);

  const terms = (
    <>
      <Link className={LINK} href="/terms">
        {t.terms}
      </Link>{" "}
      {t.and}{" "}
      <Link className={LINK} href="/privacy">
        {t.privacy}
      </Link>
    </>
  );

  return (
    <main lang={lang} className="flex min-h-dvh flex-col items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-[400px]">
        {!sent && (
          <div className="mb-2 flex justify-end">
            <LanguageNav path="/signup" lang={lang} searchParams={searchParams} />
          </div>
        )}
        <div className="mb-6 flex justify-center">
          <KiraLogo lang={lang} />
        </div>

        <AuthCard>
          {sent ? (
            <>
              <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">{t.sentTitle}</h1>
              <p className="mt-1 text-[13px] text-muted">{t.sentSubtitle}</p>
              <div className="mt-5">
                <p className="text-[13px] leading-[1.6] text-muted">{t.sentBody}</p>
                <Link
                  className="mt-4 inline-block text-[13px] font-medium text-ink underline-offset-2 hover:underline"
                  href={href("/signup", { lang: ms, next: linkNext })}
                >
                  {t.sentAgain}
                </Link>
              </div>
            </>
          ) : (
            <>
              <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">{t.title}</h1>
              <p className="mt-1 text-[13px] text-muted">{t.subtitle}</p>
              {error && <AuthBanner kind="error">{error}</AuthBanner>}
              {notice && <AuthBanner kind="notice">{notice}</AuthBanner>}

              <div className="mt-5">
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
                    defaultValue={error ? rememberedEmail : undefined}
                  />
                  <label className="flex items-start gap-2 text-[13px] text-muted">
                    <input type="checkbox" name="tos" required className="mt-0.5 h-4 w-4 shrink-0 accent-brand" />
                    <span>
                      {t.agreePrefix} {terms}.
                    </span>
                  </label>
                  <p className="-mt-1.5 pl-6 text-[12px] leading-[1.5] text-muted">{t.tips}</p>
                  <SubmitButton formAction={sendSignupLink} variant="primary" size="lg">
                    {t.sendLink}
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
                    autoComplete="new-password"
                    minLength={8}
                    placeholder={t.passwordPlaceholder}
                    hint={t.passwordHint}
                  />
                  <SubmitButton formAction={createAccount} variant="primary" size="lg">
                    {t.createAccount}
                  </SubmitButton>
                </form>

                <div className="my-5 h-px bg-border" />

                <form action={signInWithGoogle}>
                  <input type="hidden" name="next" value={next} />
                  <input type="hidden" name="returnTo" value="/signup" />
                  {ms && <input type="hidden" name="lang" value="ms" />}
                  <SubmitButton variant="primary" size="lg" className="w-full">
                    <GoogleIcon />
                    {t.google}
                  </SubmitButton>
                </form>
                <p className="mt-2 text-[12px] leading-[1.5] text-muted">
                  {t.googlePrefix} {terms}. {t.tips}
                </p>
              </div>
            </>
          )}
        </AuthCard>

        <div className="mt-5 text-center text-[13px] text-muted">
          {t.haveAccount}{" "}
          <Link className="font-medium text-ink underline-offset-2 hover:underline" href={href("/login", { lang: ms })}>
            {t.signIn}
          </Link>
        </div>
      </div>
    </main>
  );
}
