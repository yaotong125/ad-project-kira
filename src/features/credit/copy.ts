import type { Lang } from "@/shared/i18n";
import { CREDIT_TEXT, type CreditTextKey } from "./copy-data";

export function ct(lang: Lang, key: CreditTextKey, vars?: Record<string, string | number>): string {
  const s: string = CREDIT_TEXT[key][lang];
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}
