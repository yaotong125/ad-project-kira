import Link from "next/link";
import { redirect } from "next/navigation";
import { errorText } from "@/shared/auth/notices";
import { first, href, type Lang, type SearchParams } from "@/shared/i18n";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { AuthBanner } from "@/shared/ui/auth-banner";
import { AuthCard } from "@/shared/ui/auth-card";
import { Field } from "@/shared/ui/field";
import { KiraLogo } from "@/shared/ui/kira-logo";
import { LanguageNav } from "@/shared/ui/language-nav";
import { SubmitButton } from "@/shared/ui/submit-button";
import { completePasswordReset } from "./actions";
import { RESET_COPY } from "./copy";

export async function ResetPasswordPage({ lang, searchParams }: { lang: Lang; searchParams: SearchParams }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ms = lang === "ms" ? "ms" : undefined;

  // Match lejar.ai: opening /auth/reset without an active recovery session bounces to /auth/forgot?error=reset_link_needed.
  if (!user) {
    redirect(href("/auth/forgot", { lang: ms, error: "reset_link_needed" }));
  }

  const t = RESET_COPY[lang];
  const error = errorText(first(searchParams.error), lang);

  return (
    <main lang={lang} className="flex min-h-dvh flex-col items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-[400px]">
        <div className="mb-2 flex justify-end">
          <LanguageNav path="/auth/reset" lang={lang} searchParams={searchParams} />
        </div>
        <div className="mb-6 flex justify-center">
          <KiraLogo lang={lang} />
        </div>

        <AuthCard>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">{t.title}</h1>
          <p className="mt-1 text-[13px] text-muted">{t.subtitle}</p>
          {error && <AuthBanner kind="error">{error}</AuthBanner>}

          <form className="mt-5 flex flex-col gap-4" action={completePasswordReset}>
            {ms && <input type="hidden" name="lang" value="ms" />}
            <Field
              id="password"
              label={t.password}
              type="password"
              name="password"
              minLength={8}
              required
              autoComplete="new-password"
              placeholder={t.passwordPlaceholder}
            />
            <Field
              id="confirmPassword"
              label={t.confirm}
              type="password"
              name="confirmPassword"
              minLength={8}
              required
              autoComplete="new-password"
              placeholder={t.confirmPlaceholder}
            />
            <SubmitButton variant="primary" size="lg">
              {t.submit}
            </SubmitButton>
          </form>
        </AuthCard>

        <div className="mt-5 text-center text-[13px] text-muted">
          <Link className="font-medium text-ink underline-offset-2 hover:underline" href={href("/login", { lang: ms })}>
            {t.back}
          </Link>
        </div>
      </div>
    </main>
  );
}
