"use server";

import { revalidatePath } from "next/cache";
import { appLang } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { lt } from "./sections";

/**
 * Learn Kira Server Actions, named after lejar.ai's (setLearnHiddenAction, skipLearnSectionAction;
 * Start records progress before opening the section's page). Each returns { ok } or { ok: false, error }
 * like Lejar's; the database functions check the caller's role and the section rules.
 */
export type LearnResult = { ok: true } | { ok: false; error: string };

function text(form: FormData, key: string) {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

export async function setLearnHiddenAction(form: FormData): Promise<LearnResult> {
  const slug = text(form, "orgSlug");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_learn_hidden", { p_slug: slug, p_hidden: text(form, "hidden") === "true" });
  if (error) {
    console.warn("[learn] hide/show failed:", error.code, error.message);
    const ms = (await appLang()) === "ms";
    return { ok: false, error: ms ? "Tidak dapat disimpan. Muat semula halaman dan cuba lagi." : "Could not save. Reload the page and try again." };
  }
  revalidatePath(`/${slug}/learn`);
  return { ok: true };
}

export async function skipLearnSectionAction(form: FormData): Promise<LearnResult> {
  const slug = text(form, "orgSlug");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("skip_learn_section", { p_slug: slug, p_section: text(form, "section") });
  if (error) {
    console.warn("[learn] skip failed:", error.code, error.message);
    return { ok: false, error: lt(await appLang(), "learn.error.notSkippable") };
  }
  revalidatePath(`/${slug}/learn`);
  return { ok: true };
}

/** "Start": marks the section in progress. The button opens the section's page whatever the outcome (as on lejar.ai). */
export async function startLearnSectionAction(form: FormData): Promise<LearnResult> {
  const slug = text(form, "orgSlug");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("start_learn_section", { p_slug: slug, p_section: text(form, "section") });
  if (error) {
    console.warn("[learn] start failed:", error.code, error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
