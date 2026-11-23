import type { Metadata } from "next";
import { StockLocationsPage } from "@/features/inventory/inventory-pages";
import { loadOrgContext } from "@/shared/org-context";

export const instant = false;
export const metadata: Metadata = { title: "Stock locations", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  return <StockLocationsPage ctx={await loadOrgContext(org)} />;
}
