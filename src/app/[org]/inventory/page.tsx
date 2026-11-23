import type { Metadata } from "next";
import { StockOverviewPage } from "@/features/inventory/inventory-pages";
import { loadOrgContext } from "@/shared/org-context";

export const instant = false;
export const metadata: Metadata = { title: "Stock", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  return <StockOverviewPage ctx={await loadOrgContext(org)} />;
}
