import type { Metadata } from "next";
import { MyInvoisSettingsPage } from "@/features/myinvois/myinvois-page";
import { loadOrgContext } from "@/shared/org-context";

/** Rendered per request (session, entity). */
export const instant = false;

export const metadata: Metadata = { title: "Settings · e-Invois", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await loadOrgContext(org);
  return <MyInvoisSettingsPage ctx={ctx} />;
}
