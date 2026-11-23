import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NewOrgPage } from "@/features/new-org/new-org-page";
import { first, resolveLang, type SearchParams } from "@/shared/i18n";
import { myOrganizations } from "@/shared/orgs";
import { createSupabaseServerClient } from "@/shared/supabase/server";

/** Rendered per request (session, query string). */
export const instant = false;

type Props = { searchParams: Promise<SearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const lang = resolveLang((await searchParams).lang);
  return { title: lang === "ms" ? "Cipta entiti baharu" : "Create new entity", robots: { index: false } };
}

export default async function Page({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login?next=%2Fnew-org");
  const email = typeof data.claims.email === "string" ? data.claims.email : "";
  const orgs = await myOrganizations();
  return (
    <NewOrgPage
      lang={resolveLang(params.lang)}
      email={email}
      hasOrganizations={orgs.length > 0}
      demoUnavailable={first(params.demo) === "unavailable"}
    />
  );
}
