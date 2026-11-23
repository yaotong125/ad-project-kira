import type { ChartAccount, DocumentReading } from "./ai/read-document";

/** What the review pages pre-fill from (stored as ai_drafts.proposal). Amounts are 2-decimal strings. */
export type Proposal = {
  documentNumber: string | null;
  documentDate: string | null;
  dueDate: string | null;
  currency: string;
  counterparty: { name: string; tin: string | null; registrationNumber: string | null } | null;
  lines: { description: string; quantity: string; unitPrice: string; taxCode: string; accountCode: string }[];
  taxTotal: string;
  total: string;
  paidFromAccountCode: string | null;
};

export type DraftType = "bill" | "payment" | "invoice" | "journal";

/** lejar.ai's default line account on a new bill (observed: 700-0000 Cost of Sales). */
export const DEFAULT_LINE_ACCOUNT = "700-0000";
/** Observed on lejar.ai's AI-drafted journal entry for a cash receipt. */
export const DEFAULT_CASH_ACCOUNT = "300-0900";

const isoDate = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : null);
const money = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : "0.00");

/** Turns the AI reading into the stored draft fields, keeping only account codes that exist in the entity's chart. */
export function toDraft(reading: DocumentReading, chart: ChartAccount[], booksStart: string) {
  const codes = new Map(chart.map((a) => [a.code, a]));
  const lineAccount = (code: string) => {
    const a = codes.get(code);
    return a && !a.is_cash && a.type !== "equity" ? code : codes.has(DEFAULT_LINE_ACCOUNT) ? DEFAULT_LINE_ACCOUNT : (chart.find((x) => x.type === "expense")?.code ?? "");
  };
  const cash = reading.paid_from_account_code && codes.get(reading.paid_from_account_code)?.is_cash
    ? reading.paid_from_account_code
    : codes.has(DEFAULT_CASH_ACCOUNT)
      ? DEFAULT_CASH_ACCOUNT
      : (chart.find((a) => a.is_cash)?.code ?? null);
  const documentDate = isoDate(reading.document_date);
  const confidence = Math.max(0, Math.min(1, Number.isFinite(reading.confidence) ? reading.confidence : 0));

  if (reading.kind === "not_accounting") {
    return {
      status: "unsupported" as const,
      draftType: null,
      documentType: reading.document_type,
      aiSummary: reading.summary,
      confidence,
      documentDate,
      error: reading.not_accounting_reason ?? "This is not a document for the books.",
      unsupportedKind: reading.document_type,
      proposal: null,
      outOfPeriod: false,
    };
  }
  const lines = (reading.lines.length > 0
    ? reading.lines
    : [{ description: reading.document_type, quantity: 1, unit_price: reading.total - reading.tax_total, tax_code: "none" as const, account_code: "" }]
  ).map((l) => ({
    description: l.description.slice(0, 300),
    quantity: Number.isFinite(l.quantity) && l.quantity > 0 ? String(l.quantity) : "1",
    unitPrice: money(l.unit_price),
    taxCode: l.tax_code,
    accountCode: lineAccount(l.account_code),
  }));
  const proposal: Proposal = {
    documentNumber: reading.document_number,
    documentDate,
    dueDate: isoDate(reading.due_date),
    currency: (reading.currency || "MYR").toUpperCase().slice(0, 3),
    counterparty: reading.counterparty
      ? { name: reading.counterparty.name.slice(0, 200), tin: reading.counterparty.tin, registrationNumber: reading.counterparty.registration_number }
      : null,
    lines,
    taxTotal: money(reading.tax_total),
    total: money(reading.total),
    paidFromAccountCode: cash,
  };
  return {
    status: "pending" as const,
    draftType: reading.kind as DraftType,
    documentType: reading.document_type,
    aiSummary: reading.summary,
    confidence,
    documentDate,
    error: null,
    unsupportedKind: null,
    proposal,
    outOfPeriod: documentDate !== null && documentDate < booksStart,
  };
}
