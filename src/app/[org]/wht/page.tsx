import type { Metadata } from "next";
import { WhtPage } from "@/features/wht-fx/wht-fx-pages";
import { loadOrgContext } from "@/shared/org-context";

/** Rendered per request (session, entity). */
export const instant = false;

export const metadata: Metadata = { title: "Withholding tax (WHT)", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await loadOrgContext(org);
  return <WhtPage ctx={ctx} />;
}
