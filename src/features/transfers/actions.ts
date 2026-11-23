"use server";

import { revalidatePath } from "next/cache";
import { booksError } from "@/features/books/db-errors";
import { createSupabaseServerClient } from "@/shared/supabase/server";

function message(e: { message?: string; details?: string } | null): string {
  const code = e?.message?.trim() ?? "";
  const d = e?.details ?? "";
  switch (code) {
    case "same_account":
      return "Pick two different accounts for a transfer.";
    case "pick_accounts":
      return "Pick both the source and destination accounts.";
    case "not_bank_or_cash":
      return `Account ${d} is not a bank or cash account.`;
    case "inactive_account":
      return `Account ${d} is inactive.`;
    case "amount_not_positive":
      return "The transfer amount must be greater than zero.";
    case "fee_negative":
      return "The bank fee cannot be negative.";
    case "bad_date":
      return "The transfer date is not a valid date.";
    case "no_bank_charges_account":
      return "Add a Bank Charges expense account before recording a transfer fee.";
    case "account_not_found":
      return "That account was not found.";
    case "need_reason":
      return "Give a reason to void this transfer.";
    case "already_void":
      return d ? `Transfer ${d} is already void.` : "This bank transfer is already void.";
    case "not_found":
      return "Bank transfer not found.";
    default:
      return booksError(e);
  }
}

function refresh(slug: string, id?: string) {
  for (const p of ["banking/transfers", "reconcile", "ledger", "reports", ""]) {
    revalidatePath(p ? `/${slug}/${p}` : `/${slug}`);
  }
  if (id) revalidatePath(`/${slug}/banking/transfers/${id}`);
}

export async function recordTransferAction(
  orgSlug: string,
  input: { fromAccountId: string; toAccountId: string; amount: string; fee: string; transferDate: string; reference: string },
): Promise<{ ok: true; id: string; number: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("record_bank_transfer", {
    p_slug: orgSlug,
    p: input,
  });
  if (error) return { ok: false, error: message(error) };
  const r = data as { id: string; number: string };
  refresh(orgSlug, r.id);
  return { ok: true, id: r.id, number: r.number };
}

export async function voidTransferAction(
  orgSlug: string,
  id: string,
  on: string,
  reason: string,
): Promise<{ ok: true; voidedOn: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("void_bank_transfer", {
    p_slug: orgSlug,
    p_id: id,
    p_on: on || null,
    p_reason: reason,
  });
  if (error) return { ok: false, error: message(error) };
  refresh(orgSlug, id);
  return { ok: true, voidedOn: String(data) };
}
