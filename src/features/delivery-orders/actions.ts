"use server";

import { revalidatePath } from "next/cache";
import { booksError } from "@/features/books/db-errors";
import { appLang } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { dot } from "./copy";
import type { DoTextKey } from "./copy-data";

export type DoInput = {
  doId?: string;
  customerName: string;
  doNumber: string;
  doDate: string;
  notes: string;
  lines: { description: string; accountCode: string; quantity: string; amount: string; taxCode: string }[];
};
type Res<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function message(e: { message?: string; details?: string } | null): Promise<string> {
  const lang = await appLang();
  const code = e?.message?.trim() ?? "";
  const map: Record<string, DoTextKey> = {
    pick_do_date: "deliveryOrders.error.pickDoDate",
    pick_invoice_date: "deliveryOrders.error.pickInvoiceDate",
    select_customer: "deliveryOrders.error.selectCustomer",
    at_least_one_line: "deliveryOrders.error.atLeastOneLine",
    line_description: "deliveryOrders.error.lineDescription",
    line_account: "deliveryOrders.error.lineAccount",
    quantity_positive: "deliveryOrders.error.quantityPositive",
    line_positive: "deliveryOrders.error.linePositive",
    transition: "deliveryOrders.error.transition",
    delete_open_only: "deliveryOrders.error.deleteOpenOnly",
  };
  if (code === "duplicate_number") {
    const ms = lang === "ms";
    return /^INV/i.test(e?.details ?? "") ? (ms ? "Nombor invois itu sudah digunakan." : "That invoice number is already used.") : ms ? "Nombor pesanan penghantaran itu sudah digunakan." : "That delivery order number is already used.";
  }
  return map[code] ? dot(lang, map[code]) : booksError(e);
}

function refresh(slug: string, id?: string) {
  revalidatePath(`/${slug}/delivery-orders`);
  if (id) revalidatePath(`/${slug}/delivery-orders/${id}`);
}

export async function saveDoAction(slug: string, input: DoInput): Promise<Res<string>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_delivery_order", { p_slug: slug, p: input });
  if (error) return { ok: false, error: await message(error) };
  const id = (data as { id: string }).id;
  refresh(slug, id);
  return { ok: true, data: id };
}

export async function doStepAction(slug: string, id: string, step: "void" | "delete" | "reopen"): Promise<Res> {
  const supabase = await createSupabaseServerClient();
  const fn = { void: "void_delivery_order", delete: "delete_delivery_order", reopen: "reopen_delivery_order" }[step];
  const { error } = await supabase.rpc(fn, { p_slug: slug, p_id: id });
  if (error) return { ok: false, error: await message(error) };
  refresh(slug, id);
  return { ok: true };
}

export async function convertDoAction(slug: string, id: string, p: { invoiceNumber: string; invoiceDate: string; dueDate: string }): Promise<Res<string>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("convert_delivery_order", { p_slug: slug, p_id: id, p_invoice_number: p.invoiceNumber, p_invoice_date: p.invoiceDate || null, p_due: p.dueDate || null });
  if (error) return { ok: false, error: await message(error) };
  refresh(slug, id);
  revalidatePath(`/${slug}/invoices`);
  return { ok: true, data: data as string };
}
