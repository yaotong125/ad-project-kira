import type { Metadata } from "next";
import { QuickInvoiceFormPage } from "@/features/quick-invoices/quick-invoices-page";
import { loadOrgContext } from "@/shared/org-context";

/** Rendered per request (session, entity). */
export const instant = false;

export const metadata: Metadata = { title: "New quick invoice", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await loadOrgContext(org);
  return <QuickInvoiceFormPage ctx={ctx} />;
}
