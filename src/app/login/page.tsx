import type { Metadata } from "next";
import { LOGIN_COPY } from "@/features/sign-in/copy";
import { LoginPage } from "@/features/sign-in/login-page";
import { resolveLang, type SearchParams } from "@/shared/i18n";

/** Rendered per request (query string, session cookies), like lejar.ai's auth pages. */
export const instant = false;

type Props = { searchParams: Promise<SearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const t = LOGIN_COPY[resolveLang((await searchParams).lang)];
  return {
    title: t.metaTitle,
    description: t.metaDescription,
    robots: { index: false, follow: true },
  };
}

export default async function Page({ searchParams }: Props) {
  const params = await searchParams;
  return <LoginPage lang={resolveLang(params.lang)} searchParams={params} />;
}
