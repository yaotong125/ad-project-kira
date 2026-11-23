import type { Metadata } from "next";
import { PrepaidsListPage } from "@/features/prepaids/prepaids-page";
import { loadOrgContext } from "@/shared/org-context";

/** Rendered per request (session, entity). */
export const instant = false;

export const metadata: Metadata = { title: "Prepaid amortisation", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await loadOrgContext(org);
  return <PrepaidsListPage ctx={ctx} />;
}
