import type { Metadata } from "next";
import { SnDetailPage } from "@/features/supplier-notes/sn-pages";

import { loadOrgContext } from "@/shared/org-context";

/** Rendered per request (session, entity). */
export const instant = false;

export const metadata: Metadata = { title: "Supplier note", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const ctx = await loadOrgContext(org);
  return <SnDetailPage ctx={ctx} id={id} />;
}
