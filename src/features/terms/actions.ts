"use server";

import { redirect } from "next/navigation";
import { back } from "@/shared/auth/form-redirect";
import { safeNext } from "@/shared/auth/next-path";
import { recordTermsIfMissing } from "@/shared/auth/terms";
import { createSupabaseServerClient } from "@/shared/supabase/server";

/** /auth/terms "Continue": records the acceptance (never overwriting an earlier date) and goes on to `next`. */
export async function acceptTerms(form: FormData): Promise<void> {
  if (form.get("tos") !== "on") back("/auth/terms", form, { error: "terms_required" });

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (!(await recordTermsIfMissing(supabase, data.user))) back("/auth/terms", form, { error: "terms_failed" });
  redirect(safeNext(form.get("next")));
}
