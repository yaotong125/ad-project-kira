"use server";

import { revalidatePath } from "next/cache";
import { booksError } from "@/features/books/db-errors";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import type { SstCadence } from "./periods";

type Res = { ok: true } | { ok: false; error: string };
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const MESSAGES: Record<string, string> = {
  owner_only: "Only the owner can change SST filing settings.",
  bad_cadence: "Pick a filing cadence.",
  bad_registration_date: "The SST registration date is too far ahead.",
  lock_in_future: "The tax lock date cannot be later than today. Lock SST once you have filed the return.",
};
const message = (e: { message?: string } | null) => MESSAGES[e?.message?.trim() ?? ""] ?? booksError(e);

function refresh(slug: string) {
  for (const p of ["sst", "sst/deemed", "settings/sst"]) revalidatePath(`/${slug}/${p}`);
}

/** Settings → SST filing: "Save SST filing settings". */
export async function saveSstFilingAction(slug: string, cadence: SstCadence, registeredOn: string): Promise<Res> {
  if (registeredOn && !ISO.test(registeredOn)) return { ok: false, error: "Enter the registration date as a date." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_sst_filing", { p_slug: slug, p_cadence: cadence, p_registered_on: registeredOn || null });
  if (error) return { ok: false, error: message(error) };
  refresh(slug);
  return { ok: true };
}

/** Settings → Tax lock date: "Save lock date" (empty clears it). */
export async function saveSstLockAction(slug: string, until: string): Promise<Res> {
  if (until && !ISO.test(until)) return { ok: false, error: "Enter the lock date as a date." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_sst_lock", { p_slug: slug, p_until: until || null });
  if (error) return { ok: false, error: message(error) };
  refresh(slug);
  return { ok: true };
}
