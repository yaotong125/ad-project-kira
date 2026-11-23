import type { Metadata } from "next";
import { SstSettingsPage } from "@/features/sst/settings-page";
import { loadOrgContext } from "@/shared/org-context";

/** Rendered per request (session, entity). */
export const instant = false;

export const metadata: Metadata = { title: "Settings · SST filing", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await loadOrgContext(org);
  return <SstSettingsPage ctx={ctx} />;
}
