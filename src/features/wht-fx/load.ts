import "server-only";
import type { createSupabaseServerClient } from "@/shared/supabase/server";
import type { AccountChoice, FxRevaluationRow, WhtEntryRow, WhtFormCode, WhtSectionCode } from "./types";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export async function loadWhtPageData(supabase: Supabase, orgId: string) {
  const [{ data: entries }, { data: accts }, { data: fxRows }] = await Promise.all([
    supabase
      .from("wht_entries")
      .select(
        "id, wht_number, payee_name, payee_tin, payee_country, section_code, form_code, payment_date, due_date, currency_code, exchange_rate, gross_foreign, gross_myr, wht_rate, wht_myr, net_paid_myr, memo, status, journal_entry_id, remitted_on, remittance_ref, remittance_journal_id",
      )
      .eq("org_id", orgId)
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("accounts")
      .select("id, code, name, type, is_cash")
      .eq("org_id", orgId)
      .eq("status", "active")
      .order("code"),
    supabase
      .from("exchange_rates")
      .select("currency_code, rate, rate_date")
      .eq("org_id", orgId)
      .order("rate_date", { ascending: false })
      .limit(100),
  ]);

  const accounts: AccountChoice[] = (accts ?? []).map((a) => ({
    id: a.id as string,
    code: a.code as string,
    name: a.name as string,
    type: a.type as string,
    isCash: Boolean(a.is_cash),
  }));

  const latestRates: Record<string, number> = { MYR: 1 };
  for (const r of fxRows ?? []) {
    const ccy = r.currency_code as string;
    if (!(ccy in latestRates)) latestRates[ccy] = Number(r.rate);
  }

  const rows: WhtEntryRow[] = (entries ?? []).map((r) => ({
    id: r.id as string,
    whtNumber: r.wht_number as string,
    payeeName: r.payee_name as string,
    payeeTin: (r.payee_tin as string | null) ?? null,
    payeeCountry: (r.payee_country as string) ?? "Non-resident",
    sectionCode: r.section_code as WhtSectionCode,
    formCode: r.form_code as WhtFormCode,
    paymentDate: r.payment_date as string,
    dueDate: r.due_date as string,
    currencyCode: r.currency_code as string,
    exchangeRate: Number(r.exchange_rate ?? 1),
    grossForeign: Number(r.gross_foreign ?? 0),
    grossMyr: Number(r.gross_myr ?? 0),
    whtRate: Number(r.wht_rate ?? 0),
    whtMyr: Number(r.wht_myr ?? 0),
    netPaidMyr: Number(r.net_paid_myr ?? 0),
    memo: (r.memo as string | null) ?? null,
    status: r.status as WhtEntryRow["status"],
    journalEntryId: (r.journal_entry_id as string | null) ?? null,
    remittedOn: (r.remitted_on as string | null) ?? null,
    remittanceRef: (r.remittance_ref as string | null) ?? null,
    remittanceJournalId: (r.remittance_journal_id as string | null) ?? null,
  }));

  const today = new Date().toISOString().slice(0, 10);
  const unremitted = rows.filter((r) => r.status === "unremitted");
  const summary = {
    unremittedTotal: unremitted.reduce((s, r) => s + r.whtMyr, 0),
    unremittedCount: unremitted.length,
    overdueCount: unremitted.filter((r) => r.dueDate < today).length,
    remittedTotal: rows.filter((r) => r.status === "remitted").reduce((s, r) => s + r.whtMyr, 0),
  };

  return {
    rows,
    summary,
    expenseAccounts: accounts.filter((a) => a.type === "expense" || a.type === "liability" || a.type === "asset"),
    bankAccounts: accounts.filter((a) => a.isCash),
    latestRates,
  };
}

export async function loadFxRevaluationPageData(supabase: Supabase, orgId: string) {
  const [{ data: revals }, { data: accts }, { data: fxRows }] = await Promise.all([
    supabase
      .from("fx_revaluations")
      .select(
        "id, reval_date, account_id, currency_code, foreign_balance, closing_rate, carrying_myr, revalued_myr, gain_loss_myr, memo, status, journal_entry_id, reversal_journal_id",
      )
      .eq("org_id", orgId)
      .order("reval_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("accounts")
      .select("id, code, name, type, is_cash")
      .eq("org_id", orgId)
      .eq("status", "active")
      .in("type", ["asset", "liability"])
      .order("code"),
    supabase
      .from("exchange_rates")
      .select("currency_code, rate, rate_date")
      .eq("org_id", orgId)
      .order("rate_date", { ascending: false })
      .limit(100),
  ]);

  const accounts: AccountChoice[] = (accts ?? []).map((a) => ({
    id: a.id as string,
    code: a.code as string,
    name: a.name as string,
    type: a.type as string,
    isCash: Boolean(a.is_cash),
  }));
  const acctMap = new Map(accounts.map((a) => [a.id, `${a.code} · ${a.name}`]));

  const latestRates: Record<string, { rate: number; date: string }> = {};
  for (const r of fxRows ?? []) {
    const ccy = r.currency_code as string;
    if (!(ccy in latestRates)) {
      latestRates[ccy] = { rate: Number(r.rate), date: r.rate_date as string };
    }
  }

  const rows: FxRevaluationRow[] = (revals ?? []).map((r) => ({
    id: r.id as string,
    revalDate: r.reval_date as string,
    accountId: r.account_id as string,
    accountLabel: acctMap.get(r.account_id as string) ?? "Account",
    currencyCode: r.currency_code as string,
    foreignBalance: Number(r.foreign_balance ?? 0),
    closingRate: Number(r.closing_rate ?? 0),
    carryingMyr: Number(r.carrying_myr ?? 0),
    revaluedMyr: Number(r.revalued_myr ?? 0),
    gainLossMyr: Number(r.gain_loss_myr ?? 0),
    memo: (r.memo as string | null) ?? null,
    status: r.status === "reversed" ? "reversed" : "posted",
    journalEntryId: (r.journal_entry_id as string | null) ?? null,
    reversalJournalId: (r.reversal_journal_id as string | null) ?? null,
  }));

  const netUnrealised = rows.filter((r) => r.status === "posted").reduce((s, r) => s + r.gainLossMyr, 0);

  return { rows, accounts, latestRates, netUnrealised };
}
