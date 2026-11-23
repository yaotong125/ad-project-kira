import type { Metadata } from "next";
import { StockTransfersPage } from "@/features/inventory/inventory-pages";
import { loadOrgContext } from "@/shared/org-context";

export const instant = false;
export const metadata: Metadata = { title: "Stock transfers", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  return <StockTransfersPage ctx={await loadOrgContext(org)} />;
}
