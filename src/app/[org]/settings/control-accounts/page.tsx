import type { Metadata } from "next";
import { ControlAccountsPage } from "@/features/settings/control-accounts-page";
import { loadOrgContext } from "@/shared/org-context";

/** Rendered per request (session, entity). */
export const instant = false;

export const metadata: Metadata = { title: "Settings · Control accounts", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await loadOrgContext(org);
  return <ControlAccountsPage ctx={ctx} />;
}
