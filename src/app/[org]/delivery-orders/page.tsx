import type { Metadata } from "next";
import { DoListPage } from "@/features/delivery-orders/do-pages";
import type { SearchParams } from "@/shared/i18n";
import { loadOrgContext } from "@/shared/org-context";

/** Rendered per request (session, entity). */
export const instant = false;

export const metadata: Metadata = { title: "Delivery orders", robots: { index: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<SearchParams> }) {
  const [{ org }, sp] = await Promise.all([params, searchParams]);
  const ctx = await loadOrgContext(org);
  return <DoListPage ctx={ctx} sp={sp} />;
}
