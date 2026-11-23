import type { Metadata } from "next";
import { ApiKeysSettingsPage } from "@/features/settings-extras/extras-pages";
import { loadOrgContext } from "@/shared/org-context";

export const instant = false;
export const metadata: Metadata = { title: "API keys", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  return <ApiKeysSettingsPage ctx={await loadOrgContext(org)} />;
}
