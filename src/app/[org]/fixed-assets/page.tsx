import type { Metadata } from "next";
import { FixedAssetsListPage } from "@/features/fixed-assets/fixed-assets-page";
import { loadOrgContext } from "@/shared/org-context";

/** Rendered per request (session, entity). */
export const instant = false;

export const metadata: Metadata = { title: "Fixed assets", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await loadOrgContext(org);
  return <FixedAssetsListPage ctx={ctx} />;
}
