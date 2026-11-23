import type { Metadata } from "next";
import { LearnPage } from "@/features/learn/learn-page";
import type { SectionId, StoredState } from "@/features/learn/sections";
import { loadOrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";

/** Rendered per request (session, entity). */
export const instant = false;

export const metadata: Metadata = { title: "Learn Kira", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await loadOrgContext(org);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("learn_progress").select("section, state").eq("org_id", ctx.org.id);
  const progress = Object.fromEntries((data ?? []).map((r) => [r.section, r.state])) as Partial<Record<SectionId, StoredState>>;
  return <LearnPage ctx={ctx} progress={progress} />;
}
