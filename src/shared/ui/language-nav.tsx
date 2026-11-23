import Link from "next/link";
import { switchLangHref, type Lang, type SearchParams } from "@/shared/i18n";

const LINK =
  "inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-[13px] text-muted underline-offset-2 hover:text-ink hover:underline";
const CURRENT = "inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-[13px] font-semibold text-ink";

/** "BM / EN" switch at the top right of the auth card (lejar.ai /login and /signup). */
export function LanguageNav({ path, lang, searchParams }: { path: string; lang: Lang; searchParams: SearchParams }) {
  return (
    <nav aria-label={lang === "ms" ? "Bahasa" : "Language"} className="flex items-center">
      {lang === "ms" ? (
        <span aria-current="true" className={CURRENT}>
          BM
        </span>
      ) : (
        <Link prefetch={false} hrefLang="ms" className={LINK} href={switchLangHref(path, searchParams, "ms")}>
          BM
        </Link>
      )}
      <span aria-hidden="true" className="text-[13px] text-muted">
        /
      </span>
      {lang === "en" ? (
        <span aria-current="true" className={CURRENT}>
          EN
        </span>
      ) : (
        <Link prefetch={false} hrefLang="en" className={LINK} href={switchLangHref(path, searchParams, "en")}>
          EN
        </Link>
      )}
    </nav>
  );
}
