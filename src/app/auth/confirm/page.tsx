import type { Metadata } from "next";
import { CONFIRM_COPY } from "@/features/sign-up/copy";
import { ConfirmPage } from "@/features/sign-up/confirm-page";
import { resolveLang, type SearchParams } from "@/shared/i18n";

/** Rendered per request (query string), like lejar.ai's auth pages. */
export const instant = false;

type Props = { searchParams: Promise<SearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const t = CONFIRM_COPY[resolveLang((await searchParams).lang)];
  return { title: t.metaTitle, robots: { index: false } };
}

export default async function Page({ searchParams }: Props) {
  const params = await searchParams;
  return <ConfirmPage lang={resolveLang(params.lang)} searchParams={params} />;
}
