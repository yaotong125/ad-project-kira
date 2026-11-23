import type { Lang } from "@/shared/i18n";
import { INVOICE_TEXT, type InvoiceTextKey } from "./copy-data";

export function vt(lang: Lang, key: InvoiceTextKey, vars?: Record<string, string | number>): string {
  const s: string = INVOICE_TEXT[key][lang];
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

/** Status chips for invoices (Lejar's tab names; "open" means recorded and awaiting payment). */
export const STATUS_CHIP: Record<string, [string, "invoices.list.tab.draft" | "invoices.list.tab.open" | "invoices.list.tab.paid" | "invoices.list.tab.void"]> = {
  draft: ["chip", "invoices.list.tab.draft"],
  open: ["chip brand", "invoices.list.tab.open"],
  paid: ["chip pos", "invoices.list.tab.paid"],
  void: ["chip", "invoices.list.tab.void"],
};
