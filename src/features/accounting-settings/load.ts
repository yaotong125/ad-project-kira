import { createSupabaseServerClient } from "@/shared/supabase/server";
import {
  DOC_SERIES_DEFAULTS,
  type DocNumberingRule,
  type ExchangeRateRow,
  type ExchangeRateSource,
  type NumberingPattern,
  type PriceBookCategory,
  type PriceBookItem,
  type PriceBookTaxCode,
} from "./types";

export async function loadDocumentNumbering(orgId: string): Promise<DocNumberingRule[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("org_document_numbering")
    .select("doc_type, prefix, pattern, pad_width, next_number, updated_at")
    .eq("org_id", orgId);

  const byType = new Map((data ?? []).map((r) => [r.doc_type as string, r]));
  return DOC_SERIES_DEFAULTS.map((d) => {
    const saved = byType.get(d.docType);
    return {
      docType: d.docType,
      label: d.label,
      group: d.group,
      prefix: (saved?.prefix as string | undefined) ?? d.prefix,
      pattern: ((saved?.pattern as NumberingPattern | undefined) ?? "{PREFIX}-{YYYY}{MM}-{SEQ}"),
      padWidth: Number(saved?.pad_width ?? 3),
      nextNumber: Number(saved?.next_number ?? 1),
      updatedAt: (saved?.updated_at as string | null | undefined) ?? null,
    };
  });
}

export async function loadPriceBook(orgId: string): Promise<{
  items: PriceBookItem[];
  revenueAccounts: Array<{ id: string; code: string; name: string }>;
}> {
  const supabase = await createSupabaseServerClient();
  const [{ data: items }, { data: accts }] = await Promise.all([
    supabase
      .from("price_book_items")
      .select("id, name, sku, category, description, unit_price_cents, tax_code, revenue_account_id, active, created_at")
      .eq("org_id", orgId)
      .order("active", { ascending: false })
      .order("name", { ascending: true }),
    supabase
      .from("accounts")
      .select("id, code, name, type")
      .eq("org_id", orgId)
      .eq("status", "active")
      .eq("type", "revenue")
      .order("code"),
  ]);

  const revenueAccounts = (accts ?? []).map((a) => ({
    id: a.id as string,
    code: a.code as string,
    name: a.name as string,
  }));
  const acctById = new Map(revenueAccounts.map((a) => [a.id, `${a.code} · ${a.name}`]));

  return {
    revenueAccounts,
    items: (items ?? []).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      sku: (r.sku as string | null) ?? null,
      category: r.category as PriceBookCategory,
      description: (r.description as string | null) ?? null,
      unitPriceCents: Number(r.unit_price_cents ?? 0),
      taxCode: r.tax_code as PriceBookTaxCode,
      revenueAccountId: (r.revenue_account_id as string | null) ?? null,
      revenueAccountLabel: r.revenue_account_id ? (acctById.get(r.revenue_account_id as string) ?? null) : null,
      active: Boolean(r.active),
      createdAt: r.created_at as string,
    })),
  };
}

export async function loadExchangeRates(orgId: string): Promise<ExchangeRateRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("exchange_rates")
    .select("id, currency_code, rate_date, rate, source, note, created_at")
    .eq("org_id", orgId)
    .order("rate_date", { ascending: false })
    .order("currency_code", { ascending: true })
    .limit(200);

  return (data ?? []).map((r) => ({
    id: r.id as string,
    currencyCode: r.currency_code as string,
    rateDate: r.rate_date as string,
    rate: Number(r.rate),
    source: r.source as ExchangeRateSource,
    note: (r.note as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}
