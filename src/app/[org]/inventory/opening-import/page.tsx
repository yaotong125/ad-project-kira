import type { Metadata } from "next";
import { OpeningStockPage } from "@/features/inventory/inventory-pages";
import { loadOrgContext } from "@/shared/org-context";

export const instant = false;
export const metadata: Metadata = { title: "Opening stock", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  return <OpeningStockPage ctx={await loadOrgContext(org)} />;
}
