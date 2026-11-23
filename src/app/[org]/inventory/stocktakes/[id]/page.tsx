import type { Metadata } from "next";
import { StocktakeDetailPage } from "@/features/inventory/inventory-pages";
import { loadOrgContext } from "@/shared/org-context";

export const instant = false;
export const metadata: Metadata = { title: "Stocktake", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  return <StocktakeDetailPage ctx={await loadOrgContext(org)} id={id} />;
}
