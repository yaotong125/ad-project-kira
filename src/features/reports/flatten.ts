import type { Block } from "./engine";

/** A statement as printable lines, shared by the CSV and PDF downloads. Amounts in sen. */
export type FlatLine = { kind: "head" | "row" | "total" | "note"; label: string; amount?: number; compare?: number };

const blk = (b: Block, withCompare: boolean): FlatLine[] => [
  { kind: "head", label: b.title },
  ...(b.rows.length === 0 ? [{ kind: "note" as const, label: "No activity in this period." }] : b.rows.map((r) => ({ kind: "row" as const, label: r.code ? `${r.code} ${r.name}` : r.name, amount: r.amount, ...(withCompare ? { compare: r.compare ?? 0 } : {}) }))),
];

export function flattenPnl(p: { sales: Block; cogs: Block; gross: number; other: Block; expenses: Block; net: number; compare?: { gross: number; net: number } }): FlatLine[] {
  const c = Boolean(p.compare);
  return [
    ...blk(p.sales, c),
    ...blk(p.cogs, c),
    { kind: "total", label: "Gross profit / (loss)", amount: p.gross, ...(c ? { compare: p.compare!.gross } : {}) },
    ...blk(p.other, c),
    ...blk(p.expenses, c),
    { kind: "total", label: "Net profit / (loss)", amount: p.net, ...(c ? { compare: p.compare!.net } : {}) },
  ];
}

export function flattenBs(b: { fixed: Block; current: Block; liabilities: Block; netCurrent: number; netAssets: number; capital: Block; retained: Block; longTerm: Block; financedBy: number; balanced: boolean }): FlatLine[] {
  return [
    ...blk(b.fixed, false),
    ...blk(b.current, false),
    ...blk(b.liabilities, false),
    { kind: "total", label: "Net current assets", amount: b.netCurrent },
    { kind: "total", label: "Net assets", amount: b.netAssets },
    { kind: "head", label: "Financed by" },
    ...blk(b.capital, false),
    ...blk(b.retained, false),
    ...blk(b.longTerm, false),
    { kind: "total", label: "Financed by", amount: b.financedBy },
    { kind: "note", label: b.balanced ? "Balanced" : "Does not balance" },
  ];
}

export function flattenCf(c: { operating: Block; investing: Block; financing: Block; change: number; opening: number; closing: number }): FlatLine[] {
  return [
    ...blk(c.operating, false),
    ...blk(c.investing, false),
    ...blk(c.financing, false),
    { kind: "total", label: "Net change in cash", amount: c.change },
    { kind: "row", label: "Opening cash", amount: c.opening },
    { kind: "total", label: "Closing cash", amount: c.closing },
  ];
}

export function toCsv(title: string, lines: FlatLine[], compareLabel?: string): string {
  const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const money = (n?: number) => (n === undefined ? "" : (n / 100).toFixed(2));
  const head = ["Line", "Amount (MYR)", ...(compareLabel ? [compareLabel] : [])];
  return [q(title), head.join(","), ...lines.map((l) => [q(l.kind === "head" ? l.label.toUpperCase() : l.label), money(l.amount), ...(compareLabel ? [money(l.compare)] : [])].join(","))].join("\r\n");
}
