"use server";

import { revalidatePath } from "next/cache";
import { booksError } from "@/features/books/db-errors";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export type BillInput = {
  orgSlug: string;
  supplierContactId: string | null;
  supplierName: string;
  supplierTin: string | null;
  billNumber: string | null;
  billDate: string;
  dueDate: string | null;
  payableAccountCode: string;
  notes: string;
  aiDraftId: string | null;
  sourceDocumentId: string | null;
  lines: { description: string; accountCode: string; quantity: string; unitPrice: string; taxCode: string }[];
};

/**
 * lejar.ai's createBillAction with intent "record" ("Save & record"): one database call creates the
 * bill, posts it to the ledger, marks the inbox draft recorded and checks Learn section 1.
 */
export async function recordBillAction(input: BillInput): Promise<{ ok: true; number: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("record_bill", { p_slug: input.orgSlug, p_bill: input });
  if (error) {
    console.warn("[bills] record failed:", error.code, error.message);
    return { ok: false, error: booksError(error) };
  }
  revalidatePath(`/${input.orgSlug}/bills`);
  revalidatePath(`/${input.orgSlug}/inbox`);
  revalidatePath(`/${input.orgSlug}/learn`);
  return { ok: true, number: data.number };
}
