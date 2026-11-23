import type { Lang } from "@/shared/i18n";
import { PAYMENT_TEXT, type PaymentTextKey } from "./copy-data";

export function pt(lang: Lang, key: PaymentTextKey, vars?: Record<string, string | number>): string {
  const s: string = PAYMENT_TEXT[key][lang];
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}
