import type { Metadata } from "next";
import { PaymentsListPage } from "@/features/payments/list-page";
import type { SearchParams } from "@/shared/i18n";

/** Rendered per request (session, entity). */
export const instant = false;

export const metadata: Metadata = { title: "Payments received", robots: { index: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<SearchParams> }) {
  const [{ org }, sp] = await Promise.all([params, searchParams]);
  return <PaymentsListPage kind="receipts" slug={org} sp={sp} />;
}
