import "server-only";
import type { createSupabaseServerClient } from "@/shared/supabase/server";

/**
 * Kira's statements, laid out like lejar.ai's MPERS-aligned Reports page (observed 2026-11-22):
 * P&L = Sales, Cost of Goods Sold, Gross profit, Other Income, Expenses, Net profit;
 * Balance sheet = Fixed Assets, Current Assets, Current Liabilities, Net current assets, Net assets,
 * financed by Capital, Retained Earnings, Long Term Liabilities; Cash flow = direct method by activity.
 * Sections come from each account's `section` in the chart. Amounts are in sen.
 */
type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type Account = { id: string; code: string; name: string; type: string; section: string; is_cash: boolean };
type Line = { entry: string; date: string; account: string; net: number }; // net = debit - credit, sen

export type Row = { code: string; name: string; amount: number; compare?: number };
export type Block = { title: string; rows: Row[]; total: number; compareTotal?: number };

const sen = (v: unknown) => Math.round(Number(v) * 100);

export class Ledger {
  private constructor(public accounts: Account[], private lines: Line[]) {}

  static async load(supabase: Supabase, orgId: string, to: string): Promise<Ledger> {
    const { data: accts } = await supabase.from("accounts").select("id, code, name, type, section, is_cash").eq("org_id", orgId).order("code");
    const lines: Line[] = [];
    for (let page = 0; page < 50; page++) {
      const { data } = await supabase
        .from("journal_lines")
        .select("entry_id, account_id, debit, credit, journal_entries!inner(occurred_on)")
        .eq("org_id", orgId)
        .lte("journal_entries.occurred_on", to)
        .range(page * 1000, page * 1000 + 999);
      for (const l of data ?? []) {
        const e = Array.isArray(l.journal_entries) ? l.journal_entries[0] : l.journal_entries;
        lines.push({ entry: l.entry_id, date: (e as { occurred_on: string }).occurred_on, account: l.account_id, net: sen(l.debit) - sen(l.credit) });
      }
      if (!data || data.length < 1000) break;
    }
    return new Ledger((accts ?? []) as Account[], lines);
  }

  private sums(from: string | null, to: string) {
    const m = new Map<string, number>();
    for (const l of this.lines) if ((!from || l.date >= from) && l.date <= to) m.set(l.account, (m.get(l.account) ?? 0) + l.net);
    return m;
  }

  /** Balance (debit − credit, sen) of each account on `asOf`, keyed by account id. */
  balances(asOf: string): Map<string, number> {
    return this.sums(null, asOf);
  }

  private block(title: string, sections: string[], sums: Map<string, number>, sign: 1 | -1, compare?: Map<string, number>): Block {
    const rows = this.accounts
      .filter((a) => sections.includes(a.section) && ((sums.get(a.id) ?? 0) !== 0 || (compare?.get(a.id) ?? 0) !== 0))
      .map((a) => ({ code: a.code, name: a.name, amount: sign * (sums.get(a.id) ?? 0), ...(compare ? { compare: sign * (compare.get(a.id) ?? 0) } : {}) }));
    return {
      title,
      rows,
      total: rows.reduce((s, r) => s + r.amount, 0),
      ...(compare ? { compareTotal: rows.reduce((s, r) => s + (r.compare ?? 0), 0) } : {}),
    };
  }

  profitAndLoss(from: string, to: string, compareRange?: { from: string; to: string }) {
    const s = this.sums(from, to);
    const c = compareRange ? this.sums(compareRange.from, compareRange.to) : undefined;
    const sales = this.block("Sales", ["sales"], s, -1, c);
    const cogs = this.block("Cost of Goods Sold", ["cost_of_sales"], s, 1, c);
    const other = this.block("Other Income", ["other_income"], s, -1, c);
    const expenses = this.block("Expenses", ["operating_expense", "other_expense"], s, 1, c);
    const gross = sales.total - cogs.total;
    const net = gross + other.total - expenses.total;
    const cmp = c
      ? { gross: (sales.compareTotal ?? 0) - (cogs.compareTotal ?? 0), net: (sales.compareTotal ?? 0) - (cogs.compareTotal ?? 0) + (other.compareTotal ?? 0) - (expenses.compareTotal ?? 0) }
      : undefined;
    return { from, to, compareRange, sales, cogs, gross, other, expenses, net, compare: cmp, hasActivity: [sales, cogs, other, expenses].some((b) => b.rows.length > 0) };
  }

  balanceSheet(asOf: string) {
    const s = this.sums(null, asOf);
    const fixed = this.block("Fixed Assets", ["fixed_asset"], s, 1);
    const current = this.block("Current Assets", ["current_asset"], s, 1);
    const liabilities = this.block("Current Liabilities", ["current_liability"], s, -1);
    const capital = this.block("Capital", ["equity"], s, -1);
    const retained = this.block("Retained Earnings", ["retained_earnings"], s, -1);
    // Profit not yet closed to retained earnings (Kira has no year-end close yet).
    let profit = 0;
    for (const a of this.accounts) if (a.type === "revenue" || a.type === "expense") profit -= s.get(a.id) ?? 0;
    if (profit !== 0) {
      retained.rows.push({ code: "", name: "Profit / (loss) not yet closed", amount: profit });
      retained.total += profit;
    }
    const longTerm = this.block("Long Term Liabilities", ["long_term_liability"], s, -1);
    const netCurrent = current.total - liabilities.total;
    const netAssets = fixed.total + netCurrent;
    const financedBy = capital.total + retained.total + longTerm.total;
    return { asOf, fixed, current, liabilities, netCurrent, netAssets, capital, retained, longTerm, financedBy, balanced: netAssets === financedBy };
  }

  /** Direct method: each cash movement is classed by the other side of its entry (largest non-cash line). */
  cashFlow(from: string, to: string) {
    const byId = new Map(this.accounts.map((a) => [a.id, a]));
    const isCash = (id: string) => byId.get(id)?.is_cash ?? false;
    const opening = this.lines.filter((l) => l.date < from && isCash(l.account)).reduce((s, l) => s + l.net, 0);
    const entries = new Map<string, Line[]>();
    for (const l of this.lines) if (l.date >= from && l.date <= to) entries.set(l.entry, [...(entries.get(l.entry) ?? []), l]);
    const groups = { operating: new Map<string, Row>(), investing: new Map<string, Row>(), financing: new Map<string, Row>() };
    for (const ls of entries.values()) {
      const cash = ls.filter((l) => isCash(l.account)).reduce((s, l) => s + l.net, 0);
      if (cash === 0) continue;
      const other = ls.filter((l) => !isCash(l.account)).sort((a, b) => Math.abs(b.net) - Math.abs(a.net))[0];
      const acct = other ? byId.get(other.account) : undefined;
      const section = acct?.section ?? "";
      const kind = section === "fixed_asset" ? "investing" : ["equity", "retained_earnings", "long_term_liability"].includes(section) ? "financing" : "operating";
      const key = acct?.code ?? "other";
      const row = groups[kind].get(key) ?? { code: acct?.code ?? "", name: acct?.name ?? "Other", amount: 0 };
      row.amount += cash;
      groups[kind].set(key, row);
    }
    const block = (title: string, m: Map<string, Row>): Block => {
      const rows = [...m.values()].filter((r) => r.amount !== 0).sort((a, b) => a.code.localeCompare(b.code));
      return { title, rows, total: rows.reduce((s, r) => s + r.amount, 0) };
    };
    const operating = block("Operating activities", groups.operating);
    const investing = block("Investing activities", groups.investing);
    const financing = block("Financing activities", groups.financing);
    const change = operating.total + investing.total + financing.total;
    return { from, to, operating, investing, financing, change, opening, closing: opening + change };
  }
}

/** The comparison range for "Prior period" (same length, just before) or "Same period last year". */
export function compareRange(mode: string, from: string, to: string, booksStart: string): { from: string; to: string } | null {
  const d = (s: string) => Date.parse(`${s}T00:00:00Z`);
  const iso = (n: number) => new Date(n).toISOString().slice(0, 10);
  if (mode === "prior_period") {
    const len = d(to) - d(from);
    const r = { from: iso(d(from) - len - 86400000), to: iso(d(from) - 86400000) };
    return r.to >= booksStart ? r : null;
  }
  if (mode === "last_year") {
    const shift = (s: string) => `${Number(s.slice(0, 4)) - 1}${s.slice(4)}`;
    const r = { from: shift(from), to: shift(to) };
    return r.to >= booksStart ? r : null;
  }
  return null;
}
