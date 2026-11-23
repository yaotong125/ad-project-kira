"use server";

import { revalidatePath } from "next/cache";
import { booksError } from "@/features/books/db-errors";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export type EntryInput = {
  orgSlug: string;
  occurredOn: string;
  reference: string;
  referenceEdited: boolean;
  memo: string;
  aiDraftId: string | null;
  sourceDocumentId: string | null;
  lines: { accountCode: string; debit: string; credit: string }[];
};

/** lejar.ai's postEntryAction ("Post entry"): posts a balanced manual journal entry. */
export async function postEntryAction(input: EntryInput): Promise<{ ok: true; number: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("post_journal_entry", { p_slug: input.orgSlug, p_entry: input });
  if (error) {
    console.warn("[journal] post failed:", error.code, error.message);
    return { ok: false, error: booksError(error) };
  }
  revalidatePath(`/${input.orgSlug}/journal-entries`);
  revalidatePath(`/${input.orgSlug}/inbox`);
  revalidatePath(`/${input.orgSlug}/learn`);
  return { ok: true, number: data.number };
}
