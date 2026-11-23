"use server";

import { revalidatePath } from "next/cache";
import { booksError } from "@/features/books/db-errors";
import { createSupabaseServerClient } from "@/shared/supabase/server";

type Res = { ok: true } | { ok: false; error: string };

/** lejar.ai's earlierYears.error.* messages (Kira wording). */
const MESSAGES: Record<string, string> = {
  not_allowed: "Only an owner or admin can change financial years.",
  too_far: "Kira adds up to 6 financial years back, and your books already go that far.",
  long_first_year: "Your first financial year is longer than 12 months, so Kira cannot add the year before it here. Contact us and we will add it for you.",
  year_locked: "Your first financial year has a locked or closed period. Unlock the year and reopen its periods first.",
  leap_year_end: "Your financial year ends on 29 February, so Kira cannot add the year before it here. Contact us and we will add it for you.",
  not_found: "That financial year is gone. Reload the page.",
};
const message = (e: { message?: string } | null) => MESSAGES[e?.message?.trim() ?? ""] ?? booksError(e);

function refresh(slug: string) {
  for (const p of ["periods", "ledger", "sst", "reports", ""]) revalidatePath(`/${slug}/${p}`);
}

export async function addEarlierYearAction(slug: string): Promise<Res> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("add_earlier_year", { p_slug: slug });
  if (error) return { ok: false, error: message(error) };
  refresh(slug);
  return { ok: true };
}

export async function setYearLockedAction(slug: string, yearId: string, locked: boolean): Promise<Res> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_fiscal_year_locked", { p_slug: slug, p_year: yearId, p_locked: locked });
  if (error) return { ok: false, error: message(error) };
  refresh(slug);
  return { ok: true };
}
