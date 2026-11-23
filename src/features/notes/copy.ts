import type { Lang } from "@/shared/i18n";
import { NOTES_TEXT, type NotesTextKey } from "./copy-data";

export function nt(lang: Lang, key: NotesTextKey, vars?: Record<string, string | number>): string {
  const s: string = NOTES_TEXT[key][lang];
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}
