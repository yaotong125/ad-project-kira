"use server";

import { revalidatePath } from "next/cache";
import { appLang } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";

/** lejar.ai dashboard "Finish setup" → "I'm all set, hide this". */
export async function hideSetupAction(orgSlug: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_setup_hidden", { p_slug: orgSlug, p_hidden: true });
  if (error) {
    console.warn("[dashboard] hide setup failed:", error.code, error.message);
    return { ok: false, error: (await appLang()) === "ms" ? "Tidak dapat disimpan. Muat semula halaman dan cuba lagi." : "Could not save. Reload the page and try again." };
  }
  revalidatePath(`/${orgSlug}`);
  return { ok: true };
}
