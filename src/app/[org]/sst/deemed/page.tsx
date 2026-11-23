import type { Metadata } from "next";
import { DeemedPage } from "@/features/sst/deemed-page";
import type { SearchParams } from "@/shared/i18n";
import { loadOrgContext } from "@/shared/org-context";

/** Rendered per request (session, entity). */
export const instant = false;

export const metadata: Metadata = { title: "Deemed payments", robots: { index: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<SearchParams> }) {
  const [{ org }, sp] = await Promise.all([params, searchParams]);
  const ctx = await loadOrgContext(org);
  return <DeemedPage ctx={ctx} sp={sp} />;
}
