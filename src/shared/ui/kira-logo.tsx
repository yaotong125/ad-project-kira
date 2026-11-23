import Link from "next/link";
import type { Lang } from "@/shared/i18n";

/** Kira's mark (Kira/frontend/src/components/KiraMark.tsx): a geometric K. */
export function KiraMark({ size = 30, color = "var(--color-ink-2)" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M5 3v14M15 3.5 8 10l7 6.5"
        stroke={color}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Mark + wordmark, in the slot lejar.ai uses for its logo (30px mark, 9px gap). */
export function KiraLogo({ lang }: { lang: Lang }) {
  return (
    <Link
      href={lang === "ms" ? "/?lang=ms" : "/"}
      aria-label={lang === "ms" ? "Kira, laman utama" : "Kira home"}
      className="inline-flex"
    >
      <span className="inline-flex items-center gap-[9px]">
        <KiraMark size={30} />
        <span
          data-testid="kira-wordmark"
          className="font-display text-[24px] leading-none font-normal tracking-[-0.01em] text-ink-2"
        >
          Kira
        </span>
      </span>
    </Link>
  );
}
