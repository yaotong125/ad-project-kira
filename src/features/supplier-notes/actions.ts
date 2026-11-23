"use server";

import { revalidatePath } from "next/cache";
import { booksError } from "@/features/books/db-errors";
import { rm } from "@/features/books/money";
import { appLang } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { st } from "./copy";
import type { SnTextKey } from "./copy-data";

export type SnInput = {
  billId: string;
  kind: "credit" | "debit";
  noteNumber: string;
  noteDate: string;
  reason: string;
  lines: { description: string; accountCode: string; quantity: string; amount: string; taxCode: string }[];
};
type Res<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function message(e: { message?: string; details?: string } | null): Promise<string> {
  const lang = await appLang();
  const ms = lang === "ms";
  const code = e?.message?.trim() ?? "";
  const map: Record<string, SnTextKey> = {
    kind_and_date: "supplierNotes.error.kindAndDate",
    reason: "supplierNotes.error.reason",
    select_bill: "supplierNotes.error.selectBill",
    at_least_one_line: "supplierNotes.error.atLeastOneLine",
    line_description: "supplierNotes.error.lineDescription",
    line_account: "supplierNotes.error.lineAccount",
    quantity_positive: "supplierNotes.error.quantityPositive",
    line_positive: "supplierNotes.error.linePositive",
    void_date: "supplierNotes.error.voidDate",
  };
  if (code === "exceeds") return st(lang, "supplierNotes.form.exceeds", { amount: rm(Math.round(Number(e?.details ?? 0) * 100)) });
  const own: Record<string, [string, string]> = {
    before_bill: ["The note date cannot be before the bill date.", "Tarikh nota tidak boleh sebelum tarikh bil."],
    note_number_taken: ["Another supplier note already uses that number.", "Nombor nota itu sudah digunakan."],
    not_draft: ["This note was already recorded or voided. Reload the page.", "Nota ini sudah direkodkan atau dibatalkan. Muat semula halaman."],
    void_reason: ["A reason is required to void.", "Sebab pembatalan diperlukan."],
    note_paid: ["This debit note has been paid. Void the payment first, then void the note.", "Nota debit ini sudah dibayar. Batalkan bayaran dahulu."],
    has_payments: ["This bill has a payment. Void the payment first, then void the bill.", "Bil ini ada bayaran. Batalkan bayaran dahulu."],
    has_notes: ["This bill has supplier notes. Void them first, then void the bill.", "Bil ini ada nota pembekal. Batalkan nota itu dahulu."],
    not_open: ["Only an unpaid recorded bill can be voided.", "Hanya bil yang belum dibayar boleh dibatalkan."],
  };
  if (own[code]) return own[code][ms ? 1 : 0];
  return map[code] ? st(lang, map[code]) : booksError(e);
}

function refresh(slug: string, billId?: string) {
  for (const p of ["bills", "bills/notes", "payments-made", "ledger", ""]) revalidatePath(`/${slug}/${p}`);
  if (billId) revalidatePath(`/${slug}/bills/${billId}`);
}

export async function saveSnAction(slug: string, input: SnInput): Promise<Res<string>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_supplier_note", { p_slug: slug, p: input });
  if (error) return { ok: false, error: await message(error) };
  refresh(slug, input.billId);
  return { ok: true, data: data as string };
}

export async function recordSnAction(slug: string, id: string, billId: string): Promise<Res> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_supplier_note", { p_slug: slug, p_id: id });
  if (error) return { ok: false, error: await message(error) };
  refresh(slug, billId);
  revalidatePath(`/${slug}/bills/notes/${id}`);
  return { ok: true };
}

export async function voidSnAction(slug: string, id: string, billId: string, on: string, reason: string): Promise<Res> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("void_supplier_note", { p_slug: slug, p_id: id, p_on: on || null, p_reason: reason });
  if (error) return { ok: false, error: await message(error) };
  refresh(slug, billId);
  revalidatePath(`/${slug}/bills/notes/${id}`);
  return { ok: true };
}

export async function voidBillAction(slug: string, id: string, on: string, reason: string): Promise<Res> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("void_bill", { p_slug: slug, p_id: id, p_on: on || null, p_reason: reason });
  if (error) return { ok: false, error: await message(error) };
  refresh(slug, id);
  return { ok: true };
}

export async function recordDraftBillAction(slug: string, id: string): Promise<Res> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_draft_bill", { p_slug: slug, p_id: id });
  if (error) return { ok: false, error: await message(error) };
  refresh(slug, id);
  revalidatePath(`/${slug}/recurring-bills`);
  return { ok: true };
}

export async function deleteDraftBillAction(slug: string, id: string): Promise<Res> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_draft_bill", { p_slug: slug, p_id: id });
  if (error) return { ok: false, error: await message(error) };
  refresh(slug, id);
  revalidatePath(`/${slug}/recurring-bills`);
  return { ok: true };
}
