import type { Metadata } from "next";
import { SstPage } from "@/features/sst/sst-page";
import type { SearchParams } from "@/shared/i18n";
import { loadOrgContext } from "@/shared/org-context";

/** Rendered per request (session, entity). */
export const instant = false;

export const metadata: Metadata = { title: "SST", robots: { index: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<SearchParams> }) {
  const [{ org }, sp] = await Promise.all([params, searchParams]);
  const ctx = await loadOrgContext(org);
  return <SstPage ctx={ctx} sp={sp} />;
}
