"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import type { DocType, ExchangeRateSource, NumberingPattern, PriceBookCategory, PriceBookTaxCode } from "./types";

type ActionResult<T = undefined> = T extends undefined ? { ok: true } | { ok: false; error: string } : ({ ok: true } & T) | { ok: false; error: string };

function errMsg(e: unknown, fallback: string) {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return fallback;
}

export async function saveDocumentNumberingAction(
  orgSlug: string,
  input: { docType: DocType; prefix: string; pattern: NumberingPattern; padWidth: number; nextNumber: number },
): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("upsert_document_numbering", {
    p_slug: orgSlug,
    p_doc_type: input.docType,
    p_prefix: input.prefix,
    p_pattern: input.pattern,
    p_pad_width: input.padWidth,
    p_next_number: input.nextNumber,
  });
  if (error) return { ok: false, error: errMsg(error, "Could not save numbering rule.") };
  revalidatePath(`/${orgSlug}/settings/document-numbering`);
  return { ok: true };
}

export async function createPriceBookItemAction(
  orgSlug: string,
  input: {
    name: string;
    sku: string;
    category: PriceBookCategory;
    description: string;
    unitPriceCents: number;
    taxCode: PriceBookTaxCode;
    revenueAccountId: string | null;
  },
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_price_book_item", {
    p_slug: orgSlug,
    p_name: input.name,
    p_sku: input.sku,
    p_category: input.category,
    p_description: input.description,
    p_unit_price_cents: Math.round(input.unitPriceCents),
    p_tax_code: input.taxCode,
    p_revenue_account_id: input.revenueAccountId || null,
  });
  if (error || !data) return { ok: false, error: errMsg(error, "Could not add price book item.") };
  revalidatePath(`/${orgSlug}/settings/price-book`);
  return { ok: true, id: data as string };
}

export async function updatePriceBookItemAction(
  orgSlug: string,
  id: string,
  input: {
    name: string;
    sku: string;
    category: PriceBookCategory;
    description: string;
    unitPriceCents: number;
    taxCode: PriceBookTaxCode;
    revenueAccountId: string | null;
  },
): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_price_book_item", {
    p_slug: orgSlug,
    p_id: id,
    p_name: input.name,
    p_sku: input.sku,
    p_category: input.category,
    p_description: input.description,
    p_unit_price_cents: Math.round(input.unitPriceCents),
    p_tax_code: input.taxCode,
    p_revenue_account_id: input.revenueAccountId || null,
  });
  if (error) return { ok: false, error: errMsg(error, "Could not update price book item.") };
  revalidatePath(`/${orgSlug}/settings/price-book`);
  return { ok: true };
}

export async function togglePriceBookItemAction(orgSlug: string, id: string, active: boolean): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("toggle_price_book_item", {
    p_slug: orgSlug,
    p_id: id,
    p_active: active,
  });
  if (error) return { ok: false, error: errMsg(error, "Could not update item status.") };
  revalidatePath(`/${orgSlug}/settings/price-book`);
  return { ok: true };
}

export async function deletePriceBookItemAction(orgSlug: string, id: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_price_book_item", {
    p_slug: orgSlug,
    p_id: id,
  });
  if (error) return { ok: false, error: errMsg(error, "Could not delete price book item.") };
  revalidatePath(`/${orgSlug}/settings/price-book`);
  return { ok: true };
}

export async function saveExchangeRateAction(
  orgSlug: string,
  input: { currencyCode: string; rateDate: string; rate: number; source: ExchangeRateSource; note: string },
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("upsert_exchange_rate", {
    p_slug: orgSlug,
    p_currency_code: input.currencyCode,
    p_rate_date: input.rateDate,
    p_rate: input.rate,
    p_source: input.source,
    p_note: input.note,
  });
  if (error || !data) return { ok: false, error: errMsg(error, "Could not save exchange rate.") };
  revalidatePath(`/${orgSlug}/settings/exchange-rates`);
  return { ok: true, id: data as string };
}

export async function deleteExchangeRateAction(orgSlug: string, id: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_exchange_rate", {
    p_slug: orgSlug,
    p_id: id,
  });
  if (error) return { ok: false, error: errMsg(error, "Could not delete exchange rate.") };
  revalidatePath(`/${orgSlug}/settings/exchange-rates`);
  return { ok: true };
}
