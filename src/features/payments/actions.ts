"use server";

import { revalidatePath } from "next/cache";
import { booksError } from "@/features/books/db-errors";
import { appLang } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { pt } from "./copy";

/** lejar.ai's receipt and payment Server Actions (chunks 1hl7z1604qdt4, 3p44g4fs486ds, 1zdueibw-4tbz). */
type Result = { ok: true; id?: string } | { ok: false; error: string };

async function fail(e: { message?: string; details?: string } | null, side: "receipts" | "payments"): Promise<Result> {
  const lang = await appLang();
  const code = e?.message ?? "";
  const n = e?.details ?? "";
  const map: Record<string, string> = {
    no_allocation: pt(lang, "payments.error.noAllocation"),
    amount_format: pt(lang, `${side}.error.${side === "receipts" ? "allocationPositive" : "amountPositive"}` as never),
    over_allocated: side === "payments" ? `Allocation to bill ${n} exceeds what it still owes.` : `Allocation to invoice ${n} exceeds what it still owes.`,
    invoice_not_open: "That invoice is not open any more. Reload the page.",
    bill_not_open: "That bill is not open any more. Reload the page.",
    charges_too_high: pt(lang, "receipts.form.chargesTooHigh"),
    one_customer: pt(lang, "receipts.error.oneCustomer"),
    void_reason: pt(lang, `${side}.error.voidReason` as never),
    void_date: pt(lang, `${side}.error.voidDate` as never),
    before_invoice: `The receipt date is before invoice ${n}.`,
    before_bill: `The payment date is before bill ${n}.`,
    owner_account: "Pick an owner's capital or amount-owed account.",
    credit_used: "Customer credit kept from this receipt has already been applied to an invoice. Undo that first, then void the receipt.",
    name_customer: pt(lang, "receipts.error.nameCustomer"),
    has_receipts: pt(lang, "receipts.error.invoiceHasReceipt", { number: "" }).replace("  ", " "),
  };
  return { ok: false, error: map[code] ?? booksError(e) };
}

function refresh(slug: string) {
  for (const p of ["payments-received", "payments-made", "invoices", "bills", "import", "reconcile", "learn"]) revalidatePath(`/${slug}/${p}`);
}

export type Allocation = { id: string; amount: string };

export async function recordReceiptAction(orgSlug: string, r: { receiptDate: string; bankAccountCode: string; reference: string; bankCharges: string; allocations: Allocation[] }): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("record_receipt", {
    p_slug: orgSlug,
    p_r: { ...r, allocations: r.allocations.map((a) => ({ invoiceId: a.id, amount: a.amount })) },
  });
  if (error) return fail(error, "receipts");
  refresh(orgSlug);
  return { ok: true, id: data as string };
}

export async function recordPaymentAction(orgSlug: string, p: { paymentDate: string; paidFromCode: string; paidByOwner: boolean; reference: string; bankCharges: string; allocations: Allocation[] }): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("record_payment", {
    p_slug: orgSlug,
    p_p: { ...p, allocations: p.allocations.map((a) => ({ billId: a.id, amount: a.amount })) },
  });
  if (error) return fail(error, "payments");
  refresh(orgSlug);
  return { ok: true, id: data as string };
}

export async function voidReceiptAction(orgSlug: string, id: string, date: string, reason: string): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("void_receipt", { p_slug: orgSlug, p_id: id, p_on: date, p_reason: reason });
  if (error) return fail(error, "receipts");
  refresh(orgSlug);
  return { ok: true };
}

export async function voidPaymentAction(orgSlug: string, id: string, date: string, reason: string): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("void_payment", { p_slug: orgSlug, p_id: id, p_on: date, p_reason: reason });
  if (error) return fail(error, "payments");
  refresh(orgSlug);
  return { ok: true };
}

/** lejar.ai's settleStatementLineAction (bank import: record a line as a receipt or payment against a document). */
export async function settleStatementLineAction(orgSlug: string, lineId: string, documentId: string, side: "receipts" | "payments"): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("settle_statement_line", { p_slug: orgSlug, p_line: lineId, p_doc: documentId });
  if (error) return fail(error, side);
  refresh(orgSlug);
  return { ok: true };
}
