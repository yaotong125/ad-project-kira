/** Money helpers for forms: amounts are typed as text ("1,234.50") and kept in sen to add up exactly. */

/** Parses "1,234.5" → 123450 (sen). Empty → 0. Invalid → null. */
export function toSen(input: string): number | null {
  const s = input.replace(/,/g, "").trim();
  if (s === "") return 0;
  if (!/^-?\d*(\.\d{0,2})?$/.test(s) || s === "-" || s === ".") return null;
  return Math.round(Number(s) * 100);
}

/** Parses a quantity like "2" or "1.5" (up to 4 decimals). */
export function toQuantity(input: string): number | null {
  const s = input.replace(/,/g, "").trim();
  return /^\d*(\.\d{0,4})?$/.test(s) && s !== "" && s !== "." && Number(s) > 0 ? Number(s) : null;
}

/** 123450 → "1,234.50" */
export function fromSen(sen: number): string {
  const sign = sen < 0 ? "-" : "";
  const abs = Math.abs(sen);
  return `${sign}${Math.floor(abs / 100).toLocaleString("en-MY")}.${String(abs % 100).padStart(2, "0")}`;
}

/** lejar.ai prints money as "RM0.00". */
export function rm(sen: number): string {
  return sen < 0 ? `-RM${fromSen(-sen)}` : `RM${fromSen(sen)}`;
}

/** Major-unit string ("45.80") for the database. */
export function senToMajor(sen: number): string {
  return (sen / 100).toFixed(2);
}

export const TAX_RATES: Record<string, number> = { none: 0, sst_6: 0.06, sst_8: 0.08, sales_5: 0.05, sales_10: 0.1, exempt: 0 };

/** Line net and tax in sen, rounded like the database (round half away from zero to the sen). */
export function lineSen(quantity: number, unitPriceSen: number, taxCode: string) {
  const net = Math.round(quantity * unitPriceSen);
  const tax = Math.round(net * (TAX_RATES[taxCode] ?? 0));
  return { net, tax };
}
