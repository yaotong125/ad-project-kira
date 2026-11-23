import type { Metadata } from "next";
import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { loadDashboard } from "@/features/dashboard/load";
import { loadOrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";

/** Rendered per request (session, entity). */
export const instant = false;

export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };

/** /{slug}: lejar.ai's Dashboard (observed 2026-11-22). */
export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await loadOrgContext(org);
  const supabase = await createSupabaseServerClient();
  const d = await loadDashboard(supabase, ctx);
  return <DashboardPage ctx={ctx} d={d} />;
}
