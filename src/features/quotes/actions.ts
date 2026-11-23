"use server";

import { revalidatePath } from "next/cache";
import { booksError } from "@/features/books/db-errors";
import { appLang } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { qt } from "./copy";

export type QuoteInput = {
  quoteId?: string;
  customerName: string;
  quoteNumber: string;
  quoteDate: string;
  expiresOn: string;
  notes: string;
  lines: { description: string; accountCode: string; amount: string; taxCode: string }[];
};
type Res<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function message(e: { message?: string; details?: string } | null): Promise<string> {
  const lang = await appLang();
  const ms = lang === "ms";
  const code = e?.message?.trim() ?? "";
  const map: Record<string, [string, string]> = {
    customer_required: ["Pick or type the customer.", "Pilih atau taip pelanggan."],
    unknown_customer: ["That customer is gone. Pick the customer again.", "Pelanggan itu sudah tiada. Pilih semula."],
    date_required: ["Pick the date.", "Pilih tarikh."],
    expiry_before_date: ["The expiry date cannot be before the quote date.", "Tarikh tamat tidak boleh sebelum tarikh sebut harga."],
    one_line: ["Add at least one line.", "Tambah sekurang-kurangnya satu baris."],
    line_description: ["Every line needs a description.", "Setiap baris perlu keterangan."],
    unknown_account: ["Pick an account for every line.", "Pilih akaun bagi setiap baris."],
    line_positive: ["Every line amount must be greater than zero.", "Setiap amaun baris mesti lebih daripada sifar."],
    duplicate_number: [`Quote number ${e?.details ?? ""} is already used.`, `Nombor sebut harga ${e?.details ?? ""} sudah digunakan.`],
    not_editable: ["This quote can no longer be edited.", "Sebut harga ini tidak boleh disunting lagi."],
    duplicate_invoice: ["That invoice number is already used.", "Nombor invois itu sudah digunakan."],
  };
  if (code === "transition") return qt(lang, "quotes.error.transition");
  if (code === "duplicate_number" && e?.details && /^INV/i.test(e.details)) return map.duplicate_invoice[ms ? 1 : 0];
  return map[code] ? map[code][ms ? 1 : 0] : booksError(e);
}

function refresh(slug: string, id?: string) {
  revalidatePath(`/${slug}/quotes`);
  if (id) revalidatePath(`/${slug}/quotes/${id}`);
}

export async function saveQuoteAction(slug: string, input: QuoteInput): Promise<Res<string>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_quote", { p_slug: slug, p: input });
  if (error) return { ok: false, error: await message(error) };
  const id = (data as { id: string }).id;
  refresh(slug, id);
  return { ok: true, data: id };
}

export async function quoteStepAction(slug: string, id: string, to: "sent" | "accepted" | "declined" | "expired" | "void"): Promise<Res> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("quote_transition", { p_slug: slug, p_id: id, p_to: to });
  if (error) return { ok: false, error: await message(error) };
  refresh(slug, id);
  return { ok: true };
}

export async function deleteQuoteAction(slug: string, id: string): Promise<Res> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_quote_draft", { p_slug: slug, p_id: id });
  if (error) return { ok: false, error: await message(error) };
  refresh(slug);
  return { ok: true };
}

/** "Convert to invoice": returns the new draft invoice's id. */
export async function convertQuoteAction(slug: string, id: string, p: { invoiceNumber: string; invoiceDate: string; dueDate: string }): Promise<Res<string>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("convert_quote", { p_slug: slug, p_id: id, p_invoice_number: p.invoiceNumber, p_invoice_date: p.invoiceDate || null, p_due: p.dueDate || null });
  if (error) return { ok: false, error: await message(error) };
  refresh(slug, id);
  revalidatePath(`/${slug}/invoices`);
  return { ok: true, data: data as string };
}
