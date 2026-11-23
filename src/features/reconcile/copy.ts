import type { Lang } from "@/shared/i18n";
import { RECONCILE_TEXT, type ReconcileTextKey } from "./copy-data";

export function rt(lang: Lang, key: ReconcileTextKey, vars?: Record<string, string | number>): string {
  const s: string = RECONCILE_TEXT[key][lang];
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}
