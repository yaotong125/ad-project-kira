import type { Metadata } from "next";
import { FixedAssetDetailPage } from "@/features/fixed-assets/fixed-assets-page";
import { loadOrgContext } from "@/shared/org-context";

/** Rendered per request (session, entity). */
export const instant = false;

export const metadata: Metadata = { title: "Fixed asset", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const ctx = await loadOrgContext(org);
  return <FixedAssetDetailPage ctx={ctx} id={id} />;
}
