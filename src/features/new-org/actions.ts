"use server";

import { redirect } from "next/navigation";
import { href, resolveLang } from "@/shared/i18n";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { t } from "./copy";
import { validateNewOrg } from "./validate";

export type CreateOrgResult = { ok: true; slug: string; chartMode: "standard" | "migrating" } | { ok: false; error: string };

/**
 * "Create entity". Like lejar.ai's createOrgAction it returns a result instead of redirecting;
 * the form then opens /{slug}/getting-started, or /{slug}/migrate when migrating.
 * Writes go through the create_organization() database function (one transaction).
 */
export async function createOrgAction(form: FormData): Promise<CreateOrgResult> {
  const lang = resolveLang(form.get("lang"));
  const checked = validateNewOrg(form, lang);
  if (!checked.ok) return checked;

  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { ok: false, error: t(lang, "neworg.notAuthenticated") };

  const { data, error } = await supabase.rpc("create_organization", { p_org: checked.org, p_years: checked.years });
  if (error || !data?.slug) {
    console.error("[new-org] create_organization failed:", error?.code, error?.message);
    return {
      ok: false,
      error:
        lang === "ms"
          ? "Kami tidak dapat mencipta entiti sekarang. Sila cuba lagi sebentar nanti."
          : "We could not create the entity just now. Please try again in a moment.",
    };
  }
  return { ok: true, slug: data.slug as string, chartMode: checked.org.chart_mode };
}

/** "Explore the demo": Kira has no demo company yet, so this answers with Lejar's "unavailable" text. */
export async function exploreDemoAction(form: FormData): Promise<void> {
  const lang = resolveLang(form.get("lang"));
  redirect(href("/new-org", { lang: lang === "ms" ? "ms" : undefined, demo: "unavailable" }));
}
