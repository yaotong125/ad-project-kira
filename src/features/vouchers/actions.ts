"use server";

import { revalidatePath } from "next/cache";
import { booksError } from "@/features/books/db-errors";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import type { VoucherKind } from "./types";

export type RecordVoucherInput = {
  kind: VoucherKind;
  editId?: string | null;
  date: string;
  number: string;
  partyName: string;
  cashAccountId: string;
  notes: string;
  lines: { accountCode: string; description: string; amount: string }[];
};

function message(kind: VoucherKind, e: { message?: string; code?: string } | null): string {
  switch (e?.message?.trim() ?? "") {
    case "date_required":
      return "A date (YYYY-MM-DD) is required.";
    case "choose_cash":
      return "Choose the cash or bank account.";
    case "at_least_one_line":
      return "Add at least one line.";
    case "choose_account":
      return "Choose an active account on every line.";
    case "same_account":
      return "A line account must differ from the cash or bank account.";
    case "amount_positive":
      return "Every line amount must be greater than zero.";
    case "number_taken":
      return kind === "official_receipt"
        ? "That receipt number is already used."
        : "That voucher number is already used.";
    case "void_reason":
      return "A reason is required to void.";
    case "already_void":
      return "This entry is already void.";
    case "wrong_kind":
      return kind === "official_receipt"
        ? "This entry is not an official receipt, so it cannot be edited here."
        : "This entry is not a payment voucher, so it cannot be edited here.";
    case "not_found":
      return "That entry could not be found. Reload the page.";
    default:
      return booksError(e);
  }
}

function refresh(slug: string, kind: VoucherKind) {
  const own = kind === "official_receipt" ? "official-receipts" : "expenses";
  for (const p of [own, "ledger", "reconcile", "reports", ""]) {
    revalidatePath(p ? `/${slug}/${p}` : `/${slug}`);
  }
}

export async function recordVoucherAction(
  orgSlug: string,
  input: RecordVoucherInput,
): Promise<{ ok: true; id: string; number: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("record_cash_voucher", {
    p_slug: orgSlug,
    p: {
      kind: input.kind,
      editId: input.editId || null,
      date: input.date,
      number: input.number,
      partyName: input.partyName,
      cashAccountId: input.cashAccountId,
      notes: input.notes,
      lines: input.lines,
    },
  });
  if (error) return { ok: false, error: message(input.kind, error) };
  refresh(orgSlug, input.kind);
  const r = data as { id: string; number: string };
  return { ok: true, id: r.id, number: r.number };
}

export async function voidVoucherAction(
  orgSlug: string,
  kind: VoucherKind,
  id: string,
  on: string,
  reason: string,
): Promise<{ ok: true; voidedOn: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("void_cash_voucher", {
    p_slug: orgSlug,
    p_id: id,
    p_on: on || null,
    p_reason: reason,
  });
  if (error) return { ok: false, error: message(kind, error) };
  refresh(orgSlug, kind);
  return { ok: true, voidedOn: String(data) };
}
