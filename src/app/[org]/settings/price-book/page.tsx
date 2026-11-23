import type { Metadata } from "next";
import { PriceBookPage } from "@/features/accounting-settings/accounting-pages";
import { loadOrgContext } from "@/shared/org-context";

/** Rendered per request (session, entity). */
export const instant = false;

export const metadata: Metadata = { title: "Settings · Price book", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await loadOrgContext(org);
  return <PriceBookPage ctx={ctx} />;
}
