import type { Metadata } from "next";
import { SIGNUP_COPY } from "@/features/sign-up/copy";
import { SignupPage } from "@/features/sign-up/signup-page";
import { rememberedSignupEmail } from "@/shared/auth/remembered-email";
import { resolveLang, type SearchParams } from "@/shared/i18n";

/** Rendered per request (query string, cookies), like lejar.ai's auth pages. */
export const instant = false;

type Props = { searchParams: Promise<SearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const t = SIGNUP_COPY[resolveLang((await searchParams).lang)];
  // lejar.ai lets search engines index /signup (unlike /login).
  return { title: t.metaTitle, description: t.metaDescription };
}

export default async function Page({ searchParams }: Props) {
  const params = await searchParams;
  return (
    <SignupPage lang={resolveLang(params.lang)} searchParams={params} rememberedEmail={await rememberedSignupEmail()} />
  );
}
