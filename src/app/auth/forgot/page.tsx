import type { Metadata } from "next";
import { FORGOT_COPY } from "@/features/auth-recovery/copy";
import { ForgotPasswordPage } from "@/features/auth-recovery/forgot-page";
import { resolveLang, type SearchParams } from "@/shared/i18n";

/** Rendered per request (query string). */
export const instant = false;

type Props = { searchParams: Promise<SearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const t = FORGOT_COPY[resolveLang((await searchParams).lang)];
  return { title: t.metaTitle, robots: { index: false } };
}

export default async function Page({ searchParams }: Props) {
  const params = await searchParams;
  return <ForgotPasswordPage lang={resolveLang(params.lang)} searchParams={params} />;
}
