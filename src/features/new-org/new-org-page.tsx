import type { Lang } from "@/shared/i18n";
import { AppHeader } from "@/shared/ui/app-header";
import { buttonClass } from "@/shared/ui/button";
import { exploreDemoAction } from "./actions";
import { t } from "./copy";
import { NewOrgForm } from "./new-org-form";

/** Kira's demo company name (lejar.ai's demo is its own "Selat Coffee Roasters Sdn Bhd"). */
const DEMO_COMPANY = "Kedai Kopi Kira Sdn Bhd";

/**
 * /new-org: layout and classes follow lejar.ai's page (REA capture 2026-11-22). Observed: the welcome
 * box, the demo card and "Create your first entity" show only while the user has no entity; with
 * one, Lejar shows just "Create new entity" and the form.
 */
export function NewOrgPage({
  lang,
  email,
  hasOrganizations,
  demoUnavailable,
}: {
  lang: Lang;
  email: string;
  hasOrganizations: boolean;
  demoUnavailable: boolean;
}) {
  return (
    <div className="min-h-dvh bg-bg">
      <AppHeader email={email} lang={lang} />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <div lang={lang}>
          {!hasOrganizations && (
            <div className="mb-6 rounded-lg border border-brand-border bg-brand-soft px-4 py-3 text-[13px] text-brand-ink">
              <p className="font-semibold">{t(lang, "neworg.page.welcomeTitle")}</p>
              <p className="mt-1 text-ink-2">{t(lang, "neworg.page.welcomeBody")}</p>
            </div>
          )}

          {!hasOrganizations && (
            <div className="mb-6 flex flex-col gap-3 rounded-lg border border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-[13px]">
                <p className="font-medium text-ink">{t(lang, "neworg.page.demoHeading")}</p>
                <p className="mt-0.5 text-muted">{t(lang, "neworg.page.demoBody", { name: DEMO_COMPANY })}</p>
                {demoUnavailable && (
                  <p role="alert" className="mt-1 text-negative">
                    {t(lang, "neworg.page.demoUnavailable")}
                  </p>
                )}
              </div>
              <form action={exploreDemoAction}>
                {lang === "ms" && <input type="hidden" name="lang" value="ms" />}
                <button type="submit" className={buttonClass("secondary", "default")}>
                  {t(lang, "neworg.page.demoCta")}
                </button>
              </form>
            </div>
          )}

          <h1 className="text-[22px] font-semibold tracking-tight text-ink">
            {t(lang, hasOrganizations ? "neworg.page.titleAnother" : "neworg.page.titleFirst")}
          </h1>
          <p className="mt-1 max-w-prose text-sm text-muted">{t(lang, "neworg.page.description")}</p>
          <div className="mt-6">
            <NewOrgForm lang={lang} />
          </div>
        </div>
      </main>
    </div>
  );
}
