import type { Lang } from "@/shared/i18n";
import { SN_TEXT, type SnTextKey } from "./copy-data";

export function st(lang: Lang, key: SnTextKey, vars?: Record<string, string | number>): string {
  const s: string = SN_TEXT[key][lang];
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}
