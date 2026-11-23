import type { Metadata } from "next";
import { getLegalMeta, LegalDocumentPage } from "@/features/legal/legal-pages";
import { resolveLang, type SearchParams } from "@/shared/i18n";

export const instant = false;

type Props = { searchParams: Promise<SearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return { title: getLegalMeta("terms", resolveLang((await searchParams).lang)) };
}

export default async function Page({ searchParams }: Props) {
  const params = await searchParams;
  return <LegalDocumentPage kind="terms" lang={resolveLang(params.lang)} />;
}
