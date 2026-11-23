import type { Metadata } from "next";
import { StocktakesListPage } from "@/features/inventory/inventory-pages";
import { loadOrgContext } from "@/shared/org-context";

export const instant = false;
export const metadata: Metadata = { title: "Stocktakes", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  return <StocktakesListPage ctx={await loadOrgContext(org)} />;
}
