import Link from "next/link";
import type { Lang } from "@/shared/i18n";
import { navText } from "@/shared/shell/copy";
import { navLabelFor } from "@/shared/shell/nav";
import { buttonClass } from "@/shared/ui/button";

const COPY = {
  en: {
    fallback: "This page",
    body: "This part of Kira is not built yet. Kira is being built one feature at a time; Learn Kira lists the main jobs in the order they arrive.",
    back: "Back to Learn Kira",
  },
  ms: {
    fallback: "Halaman ini",
    body: "Bahagian Kira ini belum dibina. Kira dibina satu ciri pada satu masa; Learn Kira menyenaraikan kerja utama mengikut urutan ia tiba.",
    back: "Kembali ke Learn Kira",
  },
};

const EXTRA: Record<string, { en: string; ms: string }> = {
  chat: { en: "Ask Kira", ms: "Ask Kira" },
  search: { en: "Search", ms: "Carian" },
  help: { en: "Help articles", ms: "Artikel bantuan" },
  "settings/account": { en: "Account & security", ms: "Akaun & keselamatan" },
};

/** Kira's page for links whose feature slice is not built yet (the sidebar shows Lejar's full menu). */
export function ComingSoon({ slug, path, lang, title: given }: { slug: string; path: string; lang: Lang; title?: string }) {
  const t = COPY[lang];
  const label = navLabelFor(path);
  const title = given ?? (label ? navText(lang, label) : (EXTRA[path]?.[lang] ?? EXTRA[path.split("/")[0]]?.[lang] ?? t.fallback));
  return (
    <div className="flex flex-col gap-6">
      <div className="py-1">
        <h1 className="m-0 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">{title}</h1>
      </div>
      <div className="card flex flex-col items-start gap-3 px-4 py-4">
        <span className="chip">{lang === "ms" ? "Akan datang" : "Coming soon"}</span>
        <p className="m-0 max-w-prose text-[13px] text-muted">{t.body}</p>
        <Link href={`/${slug}/learn`} className={buttonClass("secondary", "sm")}>
          {t.back}
        </Link>
      </div>
    </div>
  );
}
