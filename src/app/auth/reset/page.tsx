import type { Metadata } from "next";
import { RESET_COPY } from "@/features/auth-recovery/copy";
import { ResetPasswordPage } from "@/features/auth-recovery/reset-page";
import { resolveLang, type SearchParams } from "@/shared/i18n";

/** Rendered per request (recovery session cookie & query string). */
export const instant = false;

type Props = { searchParams: Promise<SearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const t = RESET_COPY[resolveLang((await searchParams).lang)];
  return { title: t.metaTitle, robots: { index: false } };
}

export default async function Page({ searchParams }: Props) {
  const params = await searchParams;
  return <ResetPasswordPage lang={resolveLang(params.lang)} searchParams={params} />;
}
