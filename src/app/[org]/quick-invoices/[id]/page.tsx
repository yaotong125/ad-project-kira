import type { Metadata } from "next";
import { QuickInvoiceDetailPage } from "@/features/quick-invoices/quick-invoices-page";
import { loadOrgContext } from "@/shared/org-context";

/** Rendered per request (session, entity). */
export const instant = false;

export const metadata: Metadata = { title: "Quick invoice", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const ctx = await loadOrgContext(org);
  return <QuickInvoiceDetailPage ctx={ctx} id={id} />;
}
