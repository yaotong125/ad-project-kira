import type { Metadata } from "next";
import { BillDetailPage } from "@/features/supplier-notes/sn-pages";

import { loadOrgContext } from "@/shared/org-context";

/** Rendered per request (session, entity). */
export const instant = false;

export const metadata: Metadata = { title: "Bill", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const ctx = await loadOrgContext(org);
  return <BillDetailPage ctx={ctx} id={id} />;
}
