"use server";

import { revalidatePath } from "next/cache";
import { booksError } from "@/features/books/db-errors";
import { rm } from "@/features/books/money";
import { appLang } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";

type Res = { ok: true } | { ok: false; error: string };

async function message(e: { message?: string; details?: string } | null): Promise<string> {
  const ms = (await appLang()) === "ms";
  const code = e?.message?.trim() ?? "";
  const amt = rm(Math.round(Number(e?.details ?? 0) * 100));
  const map: Record<string, [string, string]> = {
    no_credit: ["This customer has no credit to apply.", "Pelanggan ini tiada kredit untuk digunakan."],
    credit_exceeds_balance: [`The customer only has ${amt} of credit.`, `Pelanggan hanya ada kredit ${amt}.`],
    over_allocated: ["That is more than the invoice still owes.", "Amaun itu melebihi baki invois."],
    invoice_not_open: ["That invoice is not open any more. Reload the page.", "Invois itu tidak lagi terbuka. Muat semula halaman."],
    before_invoice: ["The date cannot be before the invoice date.", "Tarikh tidak boleh sebelum tarikh invois."],
    void_date: ["The undo date cannot be before the date the credit was applied.", "Tarikh batal tidak boleh sebelum tarikh kredit digunakan."],
    has_refund: ["A refund note depends on this payment. Void the refund note first.", "Nota bayaran balik bergantung pada bayaran ini. Batalkan nota itu dahulu."],
    name_customer: ["Choose the customer for this prepayment.", "Pilih pelanggan bagi pembayaran pendahuluan ini."],
    not_cash_account: ["Pick the bank or cash account the money went into.", "Pilih akaun bank atau tunai yang menerima wang."],
    amount_format: ["Enter an amount above zero.", "Masukkan amaun lebih daripada sifar."],
    no_allocation: ["Enter an amount above zero.", "Masukkan amaun lebih daripada sifar."],
  };
  return map[code] ? map[code][ms ? 1 : 0] : booksError(e);
}

function refresh(slug: string) {
  for (const p of ["contacts", "invoices", "payments-received", "sst", "ledger", ""]) revalidatePath(`/${slug}/${p}`, "layout");
}

/** lejar.ai's "Record prepayment" on a customer: a receipt with no invoice, kept as customer credit. */
export async function recordPrepaymentAction(slug: string, p: { contactId: string; date: string; bankAccountCode: string; amount: string; reference: string }): Promise<Res> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_receipt", {
    p_slug: slug,
    p_r: { receiptDate: p.date, bankAccountCode: p.bankAccountCode, reference: p.reference, bankCharges: "0", contactId: p.contactId, creditAmount: p.amount.replace(/,/g, ""), allocations: [] },
  });
  if (error) return { ok: false, error: await message(error) };
  refresh(slug);
  return { ok: true };
}

/** "Apply credit ({amount} available)": as much as the customer has, up to what the invoice owes. */
export async function applyCreditAction(slug: string, invoiceId: string, on: string): Promise<Res> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("apply_customer_credit", { p_slug: slug, p_invoice: invoiceId, p_amount: null, p_on: on });
  if (error) return { ok: false, error: await message(error) };
  refresh(slug);
  return { ok: true };
}

/** Undo a credit application (the credit goes back to the customer). */
export async function undoCreditAction(slug: string, moveId: string, on: string): Promise<Res> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("undo_credit_application", { p_slug: slug, p_move: moveId, p_on: on });
  if (error) return { ok: false, error: await message(error) };
  refresh(slug);
  return { ok: true };
}
