import type { Metadata } from "next";
import { DoDetailPage } from "@/features/delivery-orders/do-pages";

import { loadOrgContext } from "@/shared/org-context";

/** Rendered per request (session, entity). */
export const instant = false;

export const metadata: Metadata = { title: "Delivery order", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const ctx = await loadOrgContext(org);
  return <DoDetailPage ctx={ctx} id={id} />;
}
