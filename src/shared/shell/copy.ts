import type { Lang } from "@/shared/i18n";
import { SHELL_TEXT, type ShellTextKey } from "./copy-data";

export type { ShellTextKey };

/** Text of a nav label: a translation key or a fixed label. */
export function navText(lang: Lang, label: ShellTextKey | { text: string }): string {
  return typeof label === "string" ? st(lang, label) : label.text;
}

/** Looks up an app-frame string and fills `{name}` placeholders. */
export function st(lang: Lang, key: ShellTextKey, vars?: Record<string, string | number>): string {
  const s: string = SHELL_TEXT[key][lang];
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}
