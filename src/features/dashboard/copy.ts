import type { Lang } from "@/shared/i18n";
import { DASH_TEXT, type DashTextKey } from "./copy-data";

export function dt(lang: Lang, key: DashTextKey, vars?: Record<string, string | number>): string {
  const s: string = DASH_TEXT[key][lang];
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

/** Lejar's `.one` / `.other` plural pairs. */
export function dtn(lang: Lang, base: string, count: number, vars?: Record<string, string | number>): string {
  return dt(lang, `${base}.${count === 1 ? "one" : "other"}` as DashTextKey, { count, ...vars });
}
