"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import type { WhtSectionCode } from "./types";

function errMsg(e: unknown, fallback: string) {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return fallback;
}

export async function recordWhtEntryAction(
  orgSlug: string,
  input: {
    payeeName: string;
    payeeTin: string;
    payeeCountry: string;
    sectionCode: WhtSectionCode;
    paymentDate: string;
    currencyCode: string;
    exchangeRate: number;
    grossForeign: number;
    whtRate: number;
    expenseAccountId: string;
    bankAccountId: string;
    memo: string;
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("record_wht_entry", {
    p_slug: orgSlug,
    p: input,
  });
  if (error || !data) return { ok: false, error: errMsg(error, "Could not record withholding tax entry.") };
  revalidatePath(`/${orgSlug}/wht`);
  revalidatePath(`/${orgSlug}/ledger`);
  return { ok: true, id: String(data) };
}

export async function remitWhtEntryAction(
  orgSlug: string,
  input: { id: string; remittedOn: string; bankAccountId: string; reference: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("remit_wht_entry", {
    p_slug: orgSlug,
    p_id: input.id,
    p_remitted_on: input.remittedOn,
    p_bank_account_id: input.bankAccountId || null,
    p_reference: input.reference,
  });
  if (error) return { ok: false, error: errMsg(error, "Could not post LHDN remittance.") };
  revalidatePath(`/${orgSlug}/wht`);
  revalidatePath(`/${orgSlug}/ledger`);
  return { ok: true };
}

export async function voidWhtEntryAction(orgSlug: string, id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("void_wht_entry", {
    p_slug: orgSlug,
    p_id: id,
  });
  if (error) return { ok: false, error: errMsg(error, "Could not void WHT entry.") };
  revalidatePath(`/${orgSlug}/wht`);
  revalidatePath(`/${orgSlug}/ledger`);
  return { ok: true };
}

export async function postFxRevaluationAction(
  orgSlug: string,
  input: {
    revalDate: string;
    accountId: string;
    currencyCode: string;
    foreignBalance: number;
    closingRate: number;
    carryingMyr: number;
    memo: string;
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("post_fx_revaluation", {
    p_slug: orgSlug,
    p_reval_date: input.revalDate,
    p_account_id: input.accountId,
    p_currency_code: input.currencyCode,
    p_foreign_balance: input.foreignBalance,
    p_closing_rate: input.closingRate,
    p_carrying_myr: input.carryingMyr,
    p_memo: input.memo,
  });
  if (error || !data) return { ok: false, error: errMsg(error, "Could not post FX revaluation.") };
  revalidatePath(`/${orgSlug}/fx-revaluation`);
  revalidatePath(`/${orgSlug}/ledger`);
  return { ok: true, id: String(data) };
}

export async function reverseFxRevaluationAction(
  orgSlug: string,
  id: string,
  reversalDate?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reverse_fx_revaluation", {
    p_slug: orgSlug,
    p_id: id,
    p_reversal_date: reversalDate || null,
  });
  if (error) return { ok: false, error: errMsg(error, "Could not reverse FX revaluation.") };
  revalidatePath(`/${orgSlug}/fx-revaluation`);
  revalidatePath(`/${orgSlug}/ledger`);
  return { ok: true };
}
