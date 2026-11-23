import type { Metadata } from "next";
import { StockWritedownsPage } from "@/features/inventory/inventory-pages";
import { loadOrgContext } from "@/shared/org-context";

export const instant = false;
export const metadata: Metadata = { title: "Write-downs", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  return <StockWritedownsPage ctx={await loadOrgContext(org)} />;
}
