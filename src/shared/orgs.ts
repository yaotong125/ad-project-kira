import "server-only";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export type OrgSummary = { id: string; slug: string; legal_name: string; created_at: string };

/** The signed-in user's organisations, oldest first (RLS returns only their memberships). */
export async function myOrganizations(): Promise<OrgSummary[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("id, slug, legal_name, created_at")
    .order("created_at", { ascending: true });
  if (error) {
    // Before the database migration is applied the table does not exist: treat as "no organisations".
    console.warn("[orgs] could not list organisations:", error.code, error.message);
    return [];
  }
  return data ?? [];
}

/** Where a signed-in user belongs: their first organisation, or company setup when they have none. */
export async function homePath(): Promise<string> {
  const orgs = await myOrganizations();
  return orgs.length ? `/${orgs[0].slug}/getting-started` : "/new-org";
}
