import type { Lang } from "@/shared/i18n";
import { QUOTES_TEXT, type QuotesTextKey } from "./copy-data";

export function qt(lang: Lang, key: QuotesTextKey, vars?: Record<string, string | number>): string {
  const s: string = QUOTES_TEXT[key][lang];
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

export type QuoteStatus = "draft" | "sent" | "accepted" | "declined" | "expired" | "void" | "converted";
export const QUOTE_CHIP: Record<QuoteStatus, string> = {
  draft: "chip",
  sent: "chip brand",
  accepted: "chip pos",
  declined: "chip neg",
  expired: "chip warn",
  void: "chip neg",
  converted: "chip pos",
};
