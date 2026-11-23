import type { Metadata } from "next";
import { FxRevaluationPage } from "@/features/wht-fx/wht-fx-pages";
import { loadOrgContext } from "@/shared/org-context";

/** Rendered per request (session, entity). */
export const instant = false;

export const metadata: Metadata = { title: "FX revaluation", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await loadOrgContext(org);
  return <FxRevaluationPage ctx={ctx} />;
}
