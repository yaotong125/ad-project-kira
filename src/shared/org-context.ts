import "server-only";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import type { Lang } from "@/shared/i18n";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export type Role = "owner" | "admin" | "member" | "viewer";

export type OrgContext = {
  org: { id: string; slug: string; legal_name: string; learn_hidden: boolean };
  orgs: { slug: string; legal_name: string }[];
  role: Role;
  email: string;
  /** For greetings: the profile name (Google / sign-up), else the email's local part. */
  name: string;
  lang: Lang;
};

/** Language for signed-in pages: the `kira_lang` cookie (set from `?lang=` by the proxy). */
export async function appLang(): Promise<Lang> {
  return (await cookies()).get("kira_lang")?.value === "ms" ? "ms" : "en";
}

/**
 * Everything a workspace page (/{slug}/…) needs about the signed-in user and the entity.
 * Cached per request, so the layout and the page share one lookup. 404 for entities the user
 * is not a member of (RLS hides them).
 */
export const loadOrgContext = cache(async (slug: string): Promise<OrgContext> => {
  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect(`/login?next=${encodeURIComponent(`/${slug}`)}`);

  const [{ data: orgs }, lang] = await Promise.all([
    supabase.from("organizations").select("id, slug, legal_name, learn_hidden").order("legal_name"),
    appLang(),
  ]);
  const org = orgs?.find((o) => o.slug === slug);
  if (!org) notFound();

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", userId)
    .maybeSingle();

  return {
    org,
    orgs: (orgs ?? []).map((o) => ({ slug: o.slug, legal_name: o.legal_name })),
    role: (membership?.role as Role) ?? "viewer",
    email: typeof claims.claims.email === "string" ? claims.claims.email : "",
    name: displayName(claims.claims.user_metadata as Record<string, unknown> | undefined, typeof claims.claims.email === "string" ? claims.claims.email : ""),
    lang,
  };
});

function displayName(meta: Record<string, unknown> | undefined, email: string): string {
  for (const k of ["full_name", "name", "display_name"]) {
    const v = meta?.[k];
    if (typeof v === "string" && v.trim()) return v.trim().split(/\s+/)[0];
  }
  const local = email.split("@")[0] ?? "";
  return local ? local[0].toUpperCase() + local.slice(1) : "";
}
