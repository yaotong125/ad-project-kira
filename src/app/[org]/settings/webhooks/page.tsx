import type { Metadata } from "next";
import { WebhooksSettingsPage } from "@/features/settings-extras/extras-pages";
import { loadOrgContext } from "@/shared/org-context";

export const instant = false;
export const metadata: Metadata = { title: "Webhooks", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  return <WebhooksSettingsPage ctx={await loadOrgContext(org)} />;
}
