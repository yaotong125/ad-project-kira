"use server";

import { revalidatePath } from "next/cache";
import { booksError } from "@/features/books/db-errors";
import { rm } from "@/features/books/money";
import { appLang } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { nt } from "./copy";
import type { NotesTextKey } from "./copy-data";

export type NoteInput = {
  noteId?: string;
  invoiceId: string;
  kind: "credit" | "debit" | "refund";
  noteNumber: string;
  noteDate: string;
  reason: string;
  bankAccountCode: string;
  lines: { description: string; accountCode: string; quantity: string; amount: string; taxCode: string }[];
};
type Res<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function message(error: { message?: string; details?: string } | null): Promise<string> {
  const lang = await appLang();
  const code = error?.message?.trim() ?? "";
  const amt = rm(Math.round(Number(error?.details ?? 0) * 100));
  const ms = lang === "ms";
  const map: Record<string, NotesTextKey> = {
    kind_and_date: "notes.error.kindAndDate",
    reason: "notes.error.reason",
    select_invoice: "notes.error.selectInvoice",
    at_least_one_line: "notes.error.atLeastOneLine",
    line_description: "notes.error.lineDescription",
    line_account: "notes.error.lineAccount",
    quantity_positive: "notes.error.quantityPositive",
    line_positive: "notes.error.linePositive",
    refund_bank: "notes.error.refundBank",
  };
  if (code === "exceeds") return nt(lang, "notes.form.exceeds", { amount: amt });
  if (code === "credit_exceeds_due")
    return ms
      ? `Invois ini hanya berbaki ${amt} untuk dibayar. Kira belum ada kredit pelanggan: untuk wang yang sudah diterima, keluarkan nota bayaran balik.`
      : `This invoice only has ${amt} still owed. Kira has no customer credit yet: for money already received, issue a refund note instead.`;
  if (code === "refund_exceeds_paid")
    return ms ? `Hanya ${amt} telah diterima bagi invois ini dan belum dibayar balik.` : `Only ${amt} has been received on this invoice and not refunded yet.`;
  if (code === "before_invoice") return ms ? "Tarikh nota tidak boleh sebelum tarikh invois." : "The note date cannot be before the invoice date.";
  if (code === "note_number_taken") return ms ? "Nombor nota itu sudah digunakan." : "Another note already uses that number.";
  if (code === "not_draft") return ms ? "Nota ini sudah direkodkan atau dibatalkan. Muat semula halaman." : "This note was already recorded or voided. Reload the page.";
  if (code === "void_reason") return ms ? "Sebab pembatalan diperlukan." : "A reason is required to void a note.";
  if (code === "void_date") return ms ? "Tarikh batal tidak boleh sebelum tarikh nota." : "The void date cannot be before the note date.";
  if (code === "credit_used")
    return ms ? "Kredit pelanggan daripada nota ini sudah digunakan. Batalkan penggunaannya dahulu." : "The customer credit this note created has been applied. Undo that first, then void the note.";
  if (code === "note_paid")
    return ms ? "Nota debit ini sudah dibayar. Batalkan resit dahulu, kemudian batalkan nota." : "This debit note has been paid. Void the receipt first, then void the note.";
  return map[code] ? nt(lang, map[code]) : booksError(error);
}

function refresh(slug: string, invoiceId?: string) {
  for (const p of ["notes", "invoices", "payments-received", "sst", "ledger", ""]) revalidatePath(`/${slug}/${p}`);
  if (invoiceId) revalidatePath(`/${slug}/invoices/${invoiceId}`);
}

/** "Save note": saves a draft and returns its id. */
export async function saveNoteAction(slug: string, input: NoteInput): Promise<Res<string>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_sales_note", { p_slug: slug, p: input });
  if (error) return { ok: false, error: await message(error) };
  refresh(slug, input.invoiceId);
  return { ok: true, data: data as string };
}

/** "Record note". */
export async function recordNoteAction(slug: string, id: string, invoiceId: string): Promise<Res> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_sales_note", { p_slug: slug, p_id: id });
  if (error) return { ok: false, error: await message(error) };
  refresh(slug, invoiceId);
  revalidatePath(`/${slug}/notes/${id}`);
  return { ok: true };
}

/** "Confirm void". */
export async function voidNoteAction(slug: string, id: string, invoiceId: string, on: string, reason: string): Promise<Res> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("void_sales_note", { p_slug: slug, p_id: id, p_on: on || null, p_reason: reason });
  if (error) return { ok: false, error: await message(error) };
  refresh(slug, invoiceId);
  revalidatePath(`/${slug}/notes/${id}`);
  return { ok: true };
}
