import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TERMS_COPY } from "@/features/terms/copy";
import { TermsPage } from "@/features/terms/terms-page";
import { resolveLang, type SearchParams } from "@/shared/i18n";
import { createSupabaseServerClient } from "@/shared/supabase/server";

/** Rendered per request (session), like the other auth pages. */
export const instant = false;

type Props = { searchParams: Promise<SearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const t = TERMS_COPY[resolveLang((await searchParams).lang)];
  return { title: t.metaTitle, robots: { index: false } };
}

export default async function Page({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login?next=%2Fauth%2Fterms");
  const email = typeof data.claims.email === "string" ? data.claims.email : "";
  return <TermsPage lang={resolveLang(params.lang)} searchParams={params} email={email} />;
}
