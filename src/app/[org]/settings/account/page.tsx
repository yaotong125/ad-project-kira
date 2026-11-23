import type { Metadata } from "next";
import { AccountSecuritySettingsPage } from "@/features/settings-extras/extras-pages";
import { loadOrgContext } from "@/shared/org-context";

export const instant = false;
export const metadata: Metadata = { title: "Account & security", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  return <AccountSecuritySettingsPage ctx={await loadOrgContext(org)} />;
}
