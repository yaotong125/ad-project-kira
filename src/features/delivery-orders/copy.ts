import type { Lang } from "@/shared/i18n";
import { DO_TEXT, type DoTextKey } from "./copy-data";

export function dot(lang: Lang, key: DoTextKey, vars?: Record<string, string | number>): string {
  const s: string = DO_TEXT[key][lang];
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

export type DoStatus = "open" | "converted" | "void";
export const DO_CHIP: Record<DoStatus, string> = { open: "chip brand", converted: "chip pos", void: "chip neg" };
