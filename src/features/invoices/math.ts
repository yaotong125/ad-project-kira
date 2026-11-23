/**
 * Invoice line maths, in sen, matching lejar.ai's module 779754 and Kira's save_invoice_draft():
 * discounts round to the sen, exclusive prices add tax on top, inclusive prices take it out.
 */
export const TAX_PERCENT: Record<string, number> = { none: 0, sst_6: 6, sst_8: 8, sales_5: 5, sales_10: 10 };
export type PricingMode = "exclusive" | "inclusive";
export type DiscountMode = "" | "percent" | "amount" | "price";

const roundHalfUp = (x: number) => Math.sign(x) * Math.round(Math.abs(x) + 1e-9);

/** Discounted unit price (sen) from a percentage, as Lejar: price * (100 - pct) / 100, half up. */
export function discountByPercent(priceSen: number, pct: number): number {
  return roundHalfUp((priceSen * (100 - pct)) / 100);
}

/** The percentage a discounted price represents, to 2 decimals. */
export function percentOf(priceSen: number, discountedSen: number): string {
  if (priceSen <= 0) return "";
  return (Math.round(((priceSen - discountedSen) / priceSen) * 10000) / 100).toFixed(2).replace(/\.?0+$/, "");
}

/** SST 8% applies from 2024-03-01; earlier invoice dates use 6% (lejar.ai). */
export function taxCodeOn(code: string, date: string) {
  return code === "sst_8" && date && date < "2024-03-01" ? "sst_6" : code;
}

/** Splits a line amount (sen) into net and tax for the pricing mode. */
export function splitTax(amountSen: number, taxCode: string, mode: PricingMode) {
  const rate = TAX_PERCENT[taxCode] ?? 0;
  if (rate === 0) return { net: amountSen, tax: 0 };
  if (mode === "inclusive") {
    const tax = roundHalfUp((amountSen * rate) / (100 + rate));
    return { net: amountSen - tax, tax };
  }
  return { net: amountSen, tax: roundHalfUp((amountSen * rate) / 100) };
}
