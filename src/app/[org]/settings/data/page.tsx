import type { Metadata } from "next";
import { DataAiSettingsPage } from "@/features/settings-extras/extras-pages";
import { loadOrgContext } from "@/shared/org-context";

export const instant = false;
export const metadata: Metadata = { title: "Data & AI", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  return <DataAiSettingsPage ctx={await loadOrgContext(org)} />;
}
