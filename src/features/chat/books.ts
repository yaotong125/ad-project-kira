import "server-only";
import { todayMY } from "@/features/books/load";
import { loadSstPeriods, loadSstReturn } from "@/features/sst/load";
import { currentPeriod, filingDue } from "@/features/sst/periods";
import type { createSupabaseServerClient } from "@/shared/supabase/server";

/**
 * Read-only views of the books for Ask Kira's tools, named after lejar.ai's (chat.turn.tool.*). Every
 * query runs with the member's own session, so RLS limits it to entities they belong to.
 */
type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type Account = { id: string; code: string; name: string; type: string; normal_balance: string; is_cash: boolean };
type Line = { debit: number; credit: number; account_id: string; description: string | null; date: string; memo: string | null; number: string | null; source: string; entry_id: string };

const r2 = (n: number) => Math.round(n * 100) / 100;
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export class Books {
  private accountsCache: Account[] | null = null;
  constructor(private supabase: Supabase, private orgId: string, private slug: string) {}

  async accounts() {
    if (!this.accountsCache) {
      const { data } = await this.supabase.from("accounts").select("id, code, name, type, normal_balance, is_cash").eq("org_id", this.orgId).eq("status", "active").order("code");
      this.accountsCache = (data ?? []) as Account[];
    }
    return this.accountsCache;
  }

  private async lines(from: string | null, to: string | null, accountId?: string): Promise<Line[]> {
    const out: Line[] = [];
    for (let page = 0; page < 20; page++) {
      let q = this.supabase
        .from("journal_lines")
        .select("debit, credit, account_id, description, journal_entries!inner(id, occurred_on, memo, entry_number, source)")
        .eq("org_id", this.orgId);
      if (accountId) q = q.eq("account_id", accountId);
      if (from) q = q.gte("journal_entries.occurred_on", from);
      if (to) q = q.lte("journal_entries.occurred_on", to);
      const { data } = await q.range(page * 1000, page * 1000 + 999);
      for (const l of data ?? []) {
        const e = one(l.journal_entries as { id: string; occurred_on: string; memo: string | null; entry_number: string | null; source: string } | { id: string; occurred_on: string; memo: string | null; entry_number: string | null; source: string }[])!;
        out.push({ debit: Number(l.debit), credit: Number(l.credit), account_id: l.account_id, description: l.description, date: e.occurred_on, memo: e.memo, number: e.entry_number, source: e.source, entry_id: e.id });
      }
      if (!data || data.length < 1000) break;
    }
    return out;
  }

  async listAccounts() {
    return (await this.accounts()).map((a) => ({ code: a.code, name: a.name, type: a.type, cash_or_bank: a.is_cash }));
  }

  async listPeriods() {
    const [{ data: years }, { data: periods }, { data: org }] = await Promise.all([
      this.supabase.from("fiscal_years").select("starts_on, ends_on, locked").eq("org_id", this.orgId).order("starts_on"),
      this.supabase.from("accounting_periods").select("starts_on, ends_on, status").eq("org_id", this.orgId).order("starts_on"),
      this.supabase.from("organizations").select("books_start, fiscal_year_end").eq("id", this.orgId).single(),
    ]);
    return { books_start: org?.books_start, financial_years: years ?? [], periods: periods ?? [] };
  }

  async trialBalance(asOf: string) {
    const accts = await this.accounts();
    const totals = new Map<string, { debit: number; credit: number }>();
    for (const l of await this.lines(null, asOf)) {
      const t = totals.get(l.account_id) ?? { debit: 0, credit: 0 };
      t.debit += l.debit;
      t.credit += l.credit;
      totals.set(l.account_id, t);
    }
    const rows = accts
      .filter((a) => totals.has(a.id))
      .map((a) => {
        const t = totals.get(a.id)!;
        const net = r2(t.debit - t.credit);
        return { code: a.code, name: a.name, type: a.type, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 };
      })
      .filter((r) => r.debit !== 0 || r.credit !== 0);
    return { as_of: asOf, currency: "MYR", rows, total_debit: r2(rows.reduce((s, r) => s + r.debit, 0)), total_credit: r2(rows.reduce((s, r) => s + r.credit, 0)) };
  }

  async profitAndLoss(from: string, to: string) {
    const accts = await this.accounts();
    const byId = new Map(accts.map((a) => [a.id, a]));
    const sums = new Map<string, number>();
    for (const l of await this.lines(from, to)) {
      const a = byId.get(l.account_id);
      if (!a || (a.type !== "revenue" && a.type !== "expense")) continue;
      sums.set(a.id, (sums.get(a.id) ?? 0) + (a.type === "revenue" ? l.credit - l.debit : l.debit - l.credit));
    }
    const section = (type: string) =>
      accts.filter((a) => a.type === type && sums.has(a.id) && r2(sums.get(a.id)!) !== 0).map((a) => ({ code: a.code, name: a.name, amount: r2(sums.get(a.id)!) }));
    const income = section("revenue");
    const expenses = section("expense");
    const totalIncome = r2(income.reduce((s, r) => s + r.amount, 0));
    const totalExpenses = r2(expenses.reduce((s, r) => s + r.amount, 0));
    return { from, to, currency: "MYR", income, total_income: totalIncome, expenses, total_expenses: totalExpenses, net_profit: r2(totalIncome - totalExpenses) };
  }

  async balanceSheet(asOf: string) {
    const accts = await this.accounts();
    const byId = new Map(accts.map((a) => [a.id, a]));
    const sums = new Map<string, number>();
    let earnings = 0;
    for (const l of await this.lines(null, asOf)) {
      const a = byId.get(l.account_id);
      if (!a) continue;
      if (a.type === "revenue" || a.type === "expense") {
        earnings += l.credit - l.debit;
        continue;
      }
      const debitNormal = a.type === "asset" || a.type === "contra_liability";
      sums.set(a.id, (sums.get(a.id) ?? 0) + (debitNormal ? l.debit - l.credit : l.credit - l.debit));
    }
    const pick = (types: string[]) =>
      accts.filter((a) => types.includes(a.type) && sums.has(a.id) && r2(sums.get(a.id)!) !== 0).map((a) => ({ code: a.code, name: a.name, amount: r2(sums.get(a.id)!) }));
    const assets = pick(["asset", "contra_asset"]);
    const liabilities = pick(["liability", "contra_liability"]);
    const equity = pick(["equity"]);
    const sum = (xs: { amount: number }[]) => r2(xs.reduce((s, r) => s + r.amount, 0));
    return {
      as_of: asOf,
      currency: "MYR",
      assets,
      total_assets: sum(assets),
      liabilities,
      total_liabilities: sum(liabilities),
      equity,
      profit_not_yet_closed_to_retained_earnings: r2(earnings),
      total_equity: r2(sum(equity) + earnings),
    };
  }

  async accountActivity(code: string, from: string | null, to: string | null) {
    const a = (await this.accounts()).find((x) => x.code === code);
    if (!a) return { error: `No account with code ${code}. Use list_accounts to find the code.` };
    const lines = (await this.lines(from, to, a.id)).sort((x, y) => x.date.localeCompare(y.date));
    const opening = from ? (await this.lines(null, prevDay(from), a.id)).reduce((s, l) => s + l.debit - l.credit, 0) : 0;
    return {
      account: `${a.code} ${a.name}`,
      from,
      to,
      opening_balance_debit_minus_credit: r2(opening),
      lines: lines.slice(-200).map((l) => ({ date: l.date, memo: l.memo ?? l.description, reference: l.number, debit: l.debit, credit: l.credit })),
      truncated: lines.length > 200,
      closing_balance_debit_minus_credit: r2(opening + lines.reduce((s, l) => s + l.debit - l.credit, 0)),
    };
  }

  async journalEntries(from: string, to: string) {
    const { data } = await this.supabase
      .from("journal_entries")
      .select("id, entry_number, occurred_on, memo, source, journal_lines(debit, credit, accounts(code, name))")
      .eq("org_id", this.orgId)
      .gte("occurred_on", from)
      .lte("occurred_on", to)
      .order("occurred_on")
      .limit(100);
    return (data ?? []).map((e) => ({
      id: e.id,
      reference: e.entry_number,
      date: e.occurred_on,
      memo: e.memo,
      source: e.source,
      lines: (e.journal_lines ?? []).map((l: { debit: unknown; credit: unknown; accounts: unknown }) => {
        const a = one(l.accounts as { code: string; name: string } | { code: string; name: string }[] | null);
        return { account: a ? `${a.code} ${a.name}` : "", debit: Number(l.debit), credit: Number(l.credit) };
      }),
    }));
  }

  async contacts(query: string | null, type: string | null) {
    let q = this.supabase.from("contacts").select("id, name, kind, tin, email, phone, default_payment_terms_days, is_active").eq("org_id", this.orgId).order("name").limit(100);
    if (query) q = q.ilike("name", `%${query.replace(/[%,()]/g, " ")}%`);
    if (type === "customer" || type === "supplier") q = q.in("kind", [type, "both"]);
    const { data } = await q;
    return data ?? [];
  }

  async invoices(status: string | null, customer: string | null) {
    let q = this.supabase.from("invoices").select("id, invoice_number, invoice_date, due_date, status, total, contacts!inner(name)").eq("org_id", this.orgId).order("invoice_date", { ascending: false }).limit(100);
    if (status) q = q.eq("status", status);
    if (customer) q = q.ilike("contacts.name", `%${customer.replace(/[%,()]/g, " ")}%`);
    const { data } = await q;
    return (data ?? []).map((i) => ({ number: i.invoice_number, customer: one(i.contacts as { name: string } | { name: string }[])?.name, date: i.invoice_date, due: i.due_date, status: i.status, total: Number(i.total), link: `/${this.slug}/invoices/${i.id}` }));
  }

  async bills(status: string | null, supplier: string | null) {
    let q = this.supabase.from("bills").select("id, bill_number, bill_date, due_date, status, total, contacts!inner(name)").eq("org_id", this.orgId).order("bill_date", { ascending: false }).limit(100);
    if (status) q = q.eq("status", status);
    if (supplier) q = q.ilike("contacts.name", `%${supplier.replace(/[%,()]/g, " ")}%`);
    const { data } = await q;
    return (data ?? []).map((b) => ({ number: b.bill_number, supplier: one(b.contacts as { name: string } | { name: string }[])?.name, date: b.bill_date, due: b.due_date, status: b.status, total: Number(b.total) }));
  }

  async invoice(number: string) {
    const { data } = await this.supabase
      .from("invoices")
      .select("id, invoice_number, invoice_date, due_date, status, pricing_mode, subtotal, tax_total, total, notes, contacts(name), invoice_lines(description, quantity, discounted_unit_price, amount, tax_code, tax_amount)")
      .eq("org_id", this.orgId)
      .eq("invoice_number", number)
      .maybeSingle();
    return data ? { ...data, link: `/${this.slug}/invoices/${data.id}` } : { error: `No invoice numbered ${number}.` };
  }

  async bill(number: string) {
    const { data } = await this.supabase
      .from("bills")
      .select("bill_number, bill_date, due_date, status, subtotal, tax_total, total, notes, contacts(name), bill_lines(description, quantity, unit_price, amount, tax_code, tax_amount)")
      .eq("org_id", this.orgId)
      .eq("bill_number", number)
      .maybeSingle();
    return data ?? { error: `No bill numbered ${number}.` };
  }

  /** The SST-02 return for the taxable period holding `on` (default: the current one), as on the SST page. */
  async sst02Return(on: string | null) {
    const info = await loadSstPeriods(this.supabase, this.orgId);
    const p = on ? info.periods.find((x) => x.startsOn <= on && on <= x.endsOn) : currentPeriod(info.periods, todayMY());
    if (!p) return { error: "No SST-02 taxable period holds that date.", periods: info.periods.map((x) => x.label) };
    const r = await loadSstReturn(this.supabase, this.orgId, p.startsOn, p.endsOn);
    const rm = (sen: number) => sen / 100;
    return {
      period: { label: p.label, from: p.startsOn, to: p.endsOn, filing_due: filingDue(p.endsOn) },
      sst_number: info.sstNumber || null,
      basis: "Sales tax on the invoice date; service tax when paid, or the day after 12 months from the invoice date if unpaid; no input tax deducted.",
      output_tax_by_type_and_rate: r.byRate.map((x) => ({ type: `${x.kind} tax`, rate_percent: x.rate, taxable_value: rm(x.value), tax: rm(x.tax) })),
      total_output_tax: rm(r.total),
      net_sst_payable: rm(r.total),
      documents: r.docs.slice(0, 100).map((d) => ({ date: d.date, kind: d.kind, invoice: d.number, type: `${d.taxKind} ${d.rate}%`, tax: rm(d.tax) })),
      ledger_output_account: rm(r.ledger.account),
      link: `/${this.slug}/sst?periodId=${p.id}`,
    };
  }
}

function prevDay(d: string) {
  return new Date(Date.parse(`${d}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
}
