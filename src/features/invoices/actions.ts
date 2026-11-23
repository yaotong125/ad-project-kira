"use server";

import { revalidatePath } from "next/cache";
import { booksError } from "@/features/books/db-errors";
import { appLang } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { vt } from "./copy";

/** lejar.ai's invoice Server Actions (chunk 0cr-ss80p7flu): createInvoiceAction / updateInvoiceAction with an intent. */
export type InvoiceLineInput = {
  description: string;
  accountCode: string;
  quantity: string;
  unitPrice: string;
  discountMode: "" | "percent" | "amount" | "price";
  discountPercent: string;
  discountAmount: string;
  discountedUnitPrice: string;
  taxCode: string;
  classificationCode: string;
};
export type InvoiceInput = {
  invoiceId: string | null;
  customerContactId: string | null;
  customerName: string;
  invoiceNumber: string | null;
  invoiceDate: string;
  dueDate: string | null;
  pricingMode: "exclusive" | "inclusive";
  notes: string;
  aiDraftId: string | null;
  sourceDocumentId: string | null;
  lines: InvoiceLineInput[];
};
export type InvoiceResult = { ok: true; id: string; number: string; status: string } | { ok: false; error: string };

async function message(error: { message?: string; details?: string } | null) {
  const lang = await appLang();
  const code = error?.message ?? "";
  const map: Record<string, Parameters<typeof vt>[1]> = {
    due_before_date: "invoices.error.dueBeforeDate",
    customer_required: "invoices.form.gap.customer",
    unknown_customer: "invoices.form.gap.customer",
    quantity_positive: "invoices.error.quantityPositive",
    amount_format: "invoices.error.amountFormat",
    line_description: "invoices.error.lineDescription",
    discount_format: "invoices.error.discountFormat",
    line_positive: "invoices.error.linePositive",
    one_line: "invoices.error.oneLine",
    unknown_account: "invoices.error.lineAccount",
    only_draft_delete: "invoices.error.onlyDraftDelete",
    void_reason: "invoices.error.voidReason",
    void_date: "invoices.error.voidDate",
    date_required: "invoices.error.dateFormat",
  };
  if (code === "duplicate_number") return vt(lang, "invoices.error.duplicateNumber", { number: error?.details ?? "" });
  if (code === "not_draft" || code === "not_open") return vt(lang, "invoices.error.notFound");
  if (code === "has_receipts") return lang === "ms" ? "Invois ini ada resit. Batalkan resit dahulu, kemudian batalkan invois." : "This invoice has a receipt. Nothing was changed. Void the receipt first, then void the invoice.";
  return map[code] ? vt(lang, map[code]) : booksError(error);
}

function refresh(slug: string) {
  revalidatePath(`/${slug}/invoices`);
  revalidatePath(`/${slug}/inbox`);
  revalidatePath(`/${slug}/learn`);
}

export async function saveInvoiceAction(orgSlug: string, input: InvoiceInput, intent: "draft" | "record"): Promise<InvoiceResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_invoice", { p_slug: orgSlug, p_inv: input, p_intent: intent });
  if (error) {
    console.warn("[invoices] save failed:", error.code, error.message);
    return { ok: false, error: await message(error) };
  }
  refresh(orgSlug);
  return { ok: true, id: data.id, number: data.number, status: data.status };
}

export async function recordInvoiceAction(orgSlug: string, id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_invoice", { p_slug: orgSlug, p_id: id });
  if (error) return { ok: false, error: await message(error) };
  refresh(orgSlug);
  return { ok: true };
}

export async function deleteInvoiceDraftAction(orgSlug: string, id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_invoice_draft", { p_slug: orgSlug, p_id: id });
  if (error) return { ok: false, error: await message(error) };
  refresh(orgSlug);
  return { ok: true };
}

export async function voidInvoiceAction(orgSlug: string, id: string, date: string, reason: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const lang = await appLang();
  if (!reason.trim()) return { ok: false, error: vt(lang, "invoices.error.voidReason") };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: vt(lang, "invoices.error.voidDate") };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("void_invoice", { p_slug: orgSlug, p_id: id, p_on: date, p_reason: reason });
  if (error) return { ok: false, error: await message(error) };
  refresh(orgSlug);
  return { ok: true };
}
