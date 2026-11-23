import Link from "next/link";
import { errorText, noticeText } from "@/shared/auth/notices";
import { first, href, type Lang, type SearchParams } from "@/shared/i18n";
import { AuthBanner } from "@/shared/ui/auth-banner";
import { AuthCard } from "@/shared/ui/auth-card";
import { Field } from "@/shared/ui/field";
import { KiraLogo } from "@/shared/ui/kira-logo";
import { LanguageNav } from "@/shared/ui/language-nav";
import { SubmitButton } from "@/shared/ui/submit-button";
import { requestPasswordReset } from "./actions";
import { FORGOT_COPY } from "./copy";

export function ForgotPasswordPage({ lang, searchParams }: { lang: Lang; searchParams: SearchParams }) {
  const t = FORGOT_COPY[lang];
  const ms = lang === "ms" ? "ms" : undefined;
  const error = errorText(first(searchParams.error), lang);
  const notice = error ? null : noticeText(first(searchParams.notice), lang);

  return (
    <main lang={lang} className="flex min-h-dvh flex-col items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-[400px]">
        <div className="mb-2 flex justify-end">
          <LanguageNav path="/auth/forgot" lang={lang} searchParams={searchParams} />
        </div>
        <div className="mb-6 flex justify-center">
          <KiraLogo lang={lang} />
        </div>

        <AuthCard>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">{t.title}</h1>
          <p className="mt-1 text-[13px] text-muted">{t.subtitle}</p>
          {error && <AuthBanner kind="error">{error}</AuthBanner>}
          {notice && <AuthBanner kind="notice">{notice}</AuthBanner>}

          <form className="mt-5 flex flex-col gap-4" action={requestPasswordReset}>
            {ms && <input type="hidden" name="lang" value="ms" />}
            <Field
              id="email"
              label={t.email}
              type="email"
              name="email"
              required
              autoComplete="email"
              autoFocus={!error}
              placeholder={t.emailPlaceholder}
            />
            <SubmitButton variant="primary" size="lg">
              {t.submit}
            </SubmitButton>
          </form>
        </AuthCard>

        <div className="mt-5 text-center text-[13px] text-muted">
          {t.remember}{" "}
          <Link className="font-medium text-ink underline-offset-2 hover:underline" href={href("/login", { lang: ms })}>
            {t.signIn}
          </Link>
        </div>
      </div>
    </main>
  );
}
