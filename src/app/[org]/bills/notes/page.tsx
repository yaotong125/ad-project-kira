import type { Metadata } from "next";
import { SnListPage } from "@/features/supplier-notes/sn-pages";

import { loadOrgContext } from "@/shared/org-context";

/** Rendered per request (session, entity). */
export const instant = false;

export const metadata: Metadata = { title: "Supplier credit / debit notes", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await loadOrgContext(org);
  return <SnListPage ctx={ctx} />;
}
