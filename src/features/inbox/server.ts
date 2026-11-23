import "server-only";
import { createSupabaseServerClient } from "@/shared/supabase/server";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** The entity behind `slug` when the signed-in user may change its books (owner, admin, member), else null. */
export async function editableOrg(supabase: Supabase, slug: unknown): Promise<{ id: string; slug: string; books_start: string } | null> {
  if (typeof slug !== "string" || !slug) return null;
  const { data: org } = await supabase.from("organizations").select("id, slug, books_start").eq("slug", slug).maybeSingle();
  if (!org) return null;
  const { data: ok } = await supabase.rpc("can_write_org", { p_org: org.id });
  return ok === true ? org : null;
}
