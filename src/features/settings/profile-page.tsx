import { notFound } from "next/navigation";
import type { OrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { loadOrgProfile } from "./load";
import { SettingsProfileClient } from "./profile-form";

/** /{slug}/settings/profile: lejar.ai's Entity profile settings (observed 2026-11-22). */
export async function SettingsProfilePage({ ctx }: { ctx: OrgContext }) {
  const supabase = await createSupabaseServerClient();
  const profile = await loadOrgProfile(supabase, ctx.org.id);
  if (!profile) notFound();
  return <SettingsProfileClient profile={profile} isOwner={ctx.role === "owner"} />;
}
