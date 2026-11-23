import type { Lang } from "@/shared/i18n";
import { LEARN_TEXT, type LearnTextKey } from "./copy-data";

/**
 * The seven Learn sections, in lejar.ai's order (2026-11-22). Section ids match Lejar's.
 * Start links: observed for receipt-to-bill (inbox) and add-contact (contacts?new=1); the others
 * are inferred from Lejar's sidebar and "New" menu (locked sections render no link).
 */
export const SECTIONS = [
  { id: "receipt-to-bill", key: "receiptToBill", path: "inbox", sample: true },
  { id: "add-contact", key: "addContact", path: "contacts?new=1", sample: false },
  { id: "send-invoice", key: "sendInvoice", path: "invoices?new=1", sample: false },
  { id: "import-bank", key: "importBank", path: "import", sample: false },
  { id: "match-bank", key: "matchBank", path: "reconcile", sample: false },
  { id: "ask-lejar", key: "askLejar", path: "chat", sample: false },
  { id: "read-pnl", key: "readPnl", path: "reports#profit-and-loss", sample: false },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];
export type StoredState = "in_progress" | "skipped" | "checked";
export type ShownState = "locked" | "open" | "inProgress" | "checked" | "skipped";

/**
 * lejar.ai's rule (observed): the first section that is neither checked nor skipped is the open
 * one (shown "In progress" once started); every section after it is locked.
 */
export function sectionStates(progress: Partial<Record<SectionId, StoredState>>): ShownState[] {
  let currentFound = false;
  return SECTIONS.map(({ id }) => {
    const s = progress[id];
    if (s === "checked") return "checked";
    if (s === "skipped") return "skipped";
    if (currentFound) return "locked";
    currentFound = true;
    return s === "in_progress" ? "inProgress" : "open";
  });
}

export function lt(lang: Lang, key: LearnTextKey, vars?: Record<string, string | number>): string {
  const s: string = LEARN_TEXT[key][lang];
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}
