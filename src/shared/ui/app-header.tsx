import Link from "next/link";
import { signOut } from "@/features/sign-in/sign-out";
import type { Lang } from "@/shared/i18n";
import { buttonClass } from "./button";

/**
 * Header of signed-in pages outside a workspace (lejar.ai /new-org): product name linking to
 * /dashboard on the left; the user's email and a ghost "Sign out" button on the right.
 */
export function AppHeader({ email, lang }: { email: string; lang: Lang }) {
  return (
    <header lang={lang} className="flex h-14 items-center justify-between border-b border-border px-6">
      <Link className="text-[13.5px] font-semibold tracking-tight text-ink" href="/dashboard">
        Kira
      </Link>
      <form action={signOut} className="flex items-center gap-3">
        <span className="text-[13px] text-muted">{email}</span>
        <button type="submit" className={buttonClass("ghost", "sm")}>
          {lang === "ms" ? "Log keluar" : "Sign out"}
        </button>
      </form>
    </header>
  );
}
