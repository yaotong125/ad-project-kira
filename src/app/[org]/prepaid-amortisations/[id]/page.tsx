import type { Metadata } from "next";
import { PrepaidDetailPage } from "@/features/prepaids/prepaids-page";
import { loadOrgContext } from "@/shared/org-context";

/** Rendered per request (session, entity). */
export const instant = false;

export const metadata: Metadata = { title: "Prepaid schedule", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const ctx = await loadOrgContext(org);
  return <PrepaidDetailPage ctx={ctx} id={id} />;
}
