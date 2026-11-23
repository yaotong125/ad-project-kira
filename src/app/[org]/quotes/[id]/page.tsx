import type { Metadata } from "next";
import { QuoteDetailPage } from "@/features/quotes/quotes-pages";

import { loadOrgContext } from "@/shared/org-context";

/** Rendered per request (session, entity). */
export const instant = false;

export const metadata: Metadata = { title: "Quote", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const ctx = await loadOrgContext(org);
  return <QuoteDetailPage ctx={ctx} id={id} />;
}
