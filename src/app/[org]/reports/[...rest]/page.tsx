import { ComingSoon } from "@/features/coming-soon/coming-soon";
import { loadOrgContext } from "@/shared/org-context";

/** Rendered per request (session, entity). */
export const instant = false;

const LABELS: Record<string, string> = {
  cashbook: "Cashbook",
  "general-ledger": "General ledger",
  "aged-payables": "Aged payables",
  "aged-receivables": "Aged receivables",
  "statement-of-account": "Statement of account",
  "customer-ledger": "Customer ledger",
  "supplier-ledger": "Supplier ledger",
  "wht-due": "WHT due",
  "stock-on-hand": "Stock on hand",
  "stock-movements": "Stock movements",
};

/** The other reports (lejar.ai's report tabs) until their slices are built. */
export default async function Page({ params }: { params: Promise<{ org: string; rest: string[] }> }) {
  const { org, rest } = await params;
  const ctx = await loadOrgContext(org);
  return <ComingSoon slug={ctx.org.slug} path="reports" lang={ctx.lang} title={LABELS[rest[0]] ?? "Reports"} />;
}
