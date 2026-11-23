export type DocType =
  | "invoice"
  | "quote"
  | "delivery_order"
  | "credit_note"
  | "debit_note"
  | "refund_note"
  | "bill"
  | "official_receipt"
  | "payment_voucher"
  | "quick_invoice"
  | "transfer";

export type NumberingPattern = "{PREFIX}-{YYYY}{MM}-{SEQ}" | "{PREFIX}-{YYYY}-{SEQ}" | "{PREFIX}-{SEQ}";

export type DocNumberingRule = {
  docType: DocType;
  label: string;
  group: "Sales" | "Purchases" | "Cash & banking";
  prefix: string;
  pattern: NumberingPattern;
  padWidth: number;
  nextNumber: number;
  updatedAt: string | null;
};

export const DOC_SERIES_DEFAULTS: Array<{
  docType: DocType;
  label: string;
  group: "Sales" | "Purchases" | "Cash & banking";
  prefix: string;
}> = [
  { docType: "invoice", label: "Sales invoice", group: "Sales", prefix: "INV" },
  { docType: "quick_invoice", label: "Quick invoice", group: "Sales", prefix: "QI" },
  { docType: "quote", label: "Quote", group: "Sales", prefix: "QT" },
  { docType: "delivery_order", label: "Delivery order", group: "Sales", prefix: "DO" },
  { docType: "credit_note", label: "Credit note", group: "Sales", prefix: "CN" },
  { docType: "debit_note", label: "Debit note", group: "Sales", prefix: "DN" },
  { docType: "refund_note", label: "Refund note", group: "Sales", prefix: "RF" },
  { docType: "bill", label: "Supplier bill", group: "Purchases", prefix: "BILL" },
  { docType: "official_receipt", label: "Official receipt", group: "Cash & banking", prefix: "OR" },
  { docType: "payment_voucher", label: "Payment voucher", group: "Cash & banking", prefix: "PV" },
  { docType: "transfer", label: "Bank transfer", group: "Cash & banking", prefix: "TRF" },
];

export const NUMBERING_PATTERNS: Array<{ value: NumberingPattern; label: string }> = [
  { value: "{PREFIX}-{YYYY}{MM}-{SEQ}", label: "Prefix + YearMonth + Sequence (INV-202611-001)" },
  { value: "{PREFIX}-{YYYY}-{SEQ}", label: "Prefix + Year + Sequence (INV-2026-001)" },
  { value: "{PREFIX}-{SEQ}", label: "Prefix + Sequence (INV-001)" },
];

export function formatNumberingPreview(
  prefix: string,
  pattern: NumberingPattern,
  padWidth: number,
  nextNumber: number,
  now = new Date(),
): string {
  const cleanPrefix = (prefix || "DOC").trim().toUpperCase();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const seq = String(Math.max(1, nextNumber)).padStart(Math.min(6, Math.max(2, padWidth)), "0");
  return pattern.replace("{PREFIX}", cleanPrefix).replace("{YYYY}", yyyy).replace("{MM}", mm).replace("{SEQ}", seq);
}

export type PriceBookCategory = "service" | "product" | "digital" | "other";
export type PriceBookTaxCode = "NONE" | "ST_8" | "ST_6" | "ST_5" | "ST_10" | "EXEMPT";

export type PriceBookItem = {
  id: string;
  name: string;
  sku: string | null;
  category: PriceBookCategory;
  description: string | null;
  unitPriceCents: number;
  taxCode: PriceBookTaxCode;
  revenueAccountId: string | null;
  revenueAccountLabel: string | null;
  active: boolean;
  createdAt: string;
};

export const PRICE_BOOK_CATEGORIES: Array<{ value: PriceBookCategory; label: string }> = [
  { value: "service", label: "Service" },
  { value: "product", label: "Product" },
  { value: "digital", label: "Digital" },
  { value: "other", label: "Other" },
];

export const PRICE_BOOK_TAX_CODES: Array<{ value: PriceBookTaxCode; label: string }> = [
  { value: "NONE", label: "No SST (0%)" },
  { value: "ST_8", label: "Service Tax 8%" },
  { value: "ST_6", label: "Service Tax 6%" },
  { value: "ST_10", label: "Sales Tax 10%" },
  { value: "ST_5", label: "Sales Tax 5%" },
  { value: "EXEMPT", label: "Exempt" },
];

export type ExchangeRateSource = "bank" | "bnm" | "manual";

export type ExchangeRateRow = {
  id: string;
  currencyCode: string;
  rateDate: string;
  rate: number;
  source: ExchangeRateSource;
  note: string | null;
  createdAt: string;
};

export const COMMON_CURRENCIES: Array<{ code: string; name: string }> = [
  { code: "USD", name: "US Dollar" },
  { code: "SGD", name: "Singapore Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
  { code: "AUD", name: "Australian Dollar" },
  { code: "CNY", name: "Chinese Yuan" },
  { code: "JPY", name: "Japanese Yen" },
  { code: "THB", name: "Thai Baht" },
  { code: "IDR", name: "Indonesian Rupiah" },
  { code: "HKD", name: "Hong Kong Dollar" },
  { code: "INR", name: "Indian Rupee" },
  { code: "PHP", name: "Philippine Peso" },
];
