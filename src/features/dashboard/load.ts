import "server-only";
import { todayMY } from "@/features/books/load";
import { SECTIONS, sectionStates, type SectionId, type StoredState } from "@/features/learn/sections";
import { documentInfo } from "@/features/books/doc-info";
import { Ledger } from "@/features/reports/engine";
import type { OrgContext } from "@/shared/org-context";
import type { createSupabaseServerClient } from "@/shared/supabase/server";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const sen = (v: unknown) => Math.round(Number(v) * 100);
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/** First and last day of the month `offset` months from the month holding `day` (YYYY-MM-DD). */
export function monthRange(day: string, offset = 0): { from: string; to: string; key: string } {
  const [y, m] = day.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  return { from: iso(d), to: iso(last), key: iso(d).slice(0, 7) };
}

export type OpenItem = { id: string; number: string; party: string; dueDate: string | null; owed: number };
export type FeedRow = {
  id: string;
  date: string;
  number: string;
  memo: string | null;
  /** Who and what: the customer or supplier and the document number(s), when the entry comes from one. */
  party: string | null;
  docs: string | null;
  source: string;
  sourceId: string | null;
  account: string | null;
  amount: number;
  reversed: boolean;
};
export type MonthPoint = { key: string; revenue: number; expenses: number };

export type Dashboard = Awaited<ReturnType<typeof loadDashboard>>;

/**
 * Everything lejar.ai's dashboard shows (observed 2026-11-22), for the current month in Malaysia time:
 * AI Inbox counts, Learn progress, "Finish setup" items, the four KPIs, bank & cash balances, money owed
 * both ways, revenue and expenses for the last 12 months, and the latest journal entries.
 */
export async function loadDashboard(supabase: Supabase, ctx: OrgContext) {
  const orgId = ctx.org.id;
  const today = todayMY();
  const month = monthRange(today);
  const prev = monthRange(today, -1);

  const [org, drafts, learn, invoices, bills, entries, ledger] = await Promise.all([
    supabase.from("organizations").select("registration_number, sst_number, tin, setup_hidden").eq("id", orgId).single(),
    supabase.from("ai_drafts").select("status").eq("org_id", orgId).in("status", ["pending", "analyzing", "failed"]),
    supabase.from("learn_progress").select("section, state").eq("org_id", orgId),
    supabase.from("invoices").select("id, invoice_number, due_date, total, paid_amount, amount_due, contacts(name)").eq("org_id", orgId).eq("status", "open").order("due_date", { ascending: true, nullsFirst: false }),
    supabase.from("bills").select("id, bill_number, due_date, total, paid_amount, amount_due, contacts(name)").eq("org_id", orgId).eq("status", "open").order("due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("journal_entries")
      .select("id, entry_number, occurred_on, memo, source, source_id, reversed_by, journal_lines(debit, credit, accounts(code, name, is_cash))")
      .eq("org_id", orgId)
      .is("voided_at", null)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(8),
    Ledger.load(supabase, orgId, today),
  ]);

  // AI Inbox
  const st = (drafts.data ?? []).map((d) => d.status);
  const inbox = { pending: st.filter((s) => s === "pending").length, waiting: st.filter((s) => s === "analyzing").length, failed: st.filter((s) => s === "failed").length };

  // Learn Kira: "{done} of 7 checked · Next: …" with the open section's link (hidden once hidden or all done)
  const progress = Object.fromEntries((learn.data ?? []).map((r) => [r.section, r.state])) as Partial<Record<SectionId, StoredState>>;
  const states = sectionStates(progress);
  const nextIdx = states.findIndex((s) => s === "open" || s === "inProgress");
  const learnCard =
    ctx.org.learn_hidden || nextIdx < 0
      ? null
      : { done: states.filter((s) => s === "checked").length, total: SECTIONS.length, next: SECTIONS[nextIdx], started: states[nextIdx] === "inProgress" };

  // Finish setup: the identifiers still missing (Lejar: "Missing: SSM, SST and TIN")
  const o = org.data;
  const missing = [!o?.registration_number && "SSM", !o?.sst_number && "SST", !o?.tin && "TIN"].filter(Boolean) as string[];
  const setup = o?.setup_hidden || missing.length === 0 ? null : { missing };

  // KPIs and the 12-month chart
  const pnl = (r: { from: string; to: string }) => {
    const p = ledger.profitAndLoss(r.from, r.to);
    const revenue = p.sales.total + p.other.total;
    const expenses = p.cogs.total + p.expenses.total;
    return { revenue, expenses, net: p.net, active: p.hasActivity };
  };
  const now = pnl(month);
  const last = pnl(prev);
  const months: MonthPoint[] = [];
  for (let i = -11; i <= 0; i++) {
    const r = monthRange(today, i);
    const p = pnl(r);
    months.push({ key: r.key, revenue: p.revenue, expenses: p.expenses });
  }
  const activeMonths = months.filter((m) => m.revenue !== 0 || m.expenses !== 0).length;

  // Bank & cash accounts, balance in the books
  const bal = ledger.balances(today);
  const cash = ledger.accounts.filter((a) => a.is_cash).map((a) => ({ code: a.code, name: a.name, balance: bal.get(a.id) ?? 0 }));

  // Money owed to you / you owe
  const items = (rows: Record<string, unknown>[] | null, numberKey: string): OpenItem[] =>
    (rows ?? [])
      .map((r) => ({
        id: r.id as string,
        number: r[numberKey] as string,
        party: one(r.contacts as { name: string } | { name: string }[] | null)?.name ?? "",
        dueDate: r.due_date as string | null,
        owed: r.amount_due != null ? sen(r.amount_due) : sen(r.total) - sen(r.paid_amount),
      }))
      .filter((r) => r.owed > 0);
  const owedToYou = items(invoices.data, "invoice_number");
  const youOwe = items(bills.data, "bill_number");

  // Activity feed: an entry is "Reversed" when a void entry shares its source document
  const rows = entries.data ?? [];
  const ids = rows.filter((e) => e.source !== "void" && e.source_id).map((e) => e.source_id as string);
  const voided = new Set<string>();
  if (ids.length > 0) {
    const { data } = await supabase.from("journal_entries").select("source_id").eq("org_id", orgId).eq("source", "void").in("source_id", ids);
    for (const v of data ?? []) voided.add(v.source_id as string);
  }
  const docInfo = await documentInfo(supabase, rows.map((e) => e.source_id));
  const feed: FeedRow[] = rows.map((e) => {
    const lines = ((e.journal_lines ?? []) as { debit: unknown; credit: unknown; accounts: unknown }[]).map((l) => ({
      net: sen(l.debit) - sen(l.credit),
      debit: sen(l.debit),
      acct: one(l.accounts as { code: string; name: string; is_cash: boolean } | null),
    }));
    // The account a reader recognises: the bank or cash side if any, else the largest line.
    const pick = lines.find((l) => l.acct?.is_cash) ?? [...lines].sort((a, b) => Math.abs(b.net) - Math.abs(a.net))[0];
    return {
      id: e.id,
      date: e.occurred_on,
      number: e.entry_number,
      memo: e.memo,
      party: (e.source_id && docInfo.get(e.source_id)?.party) || null,
      docs: (e.source_id && docInfo.get(e.source_id)?.docs) || null,
      source: e.source,
      sourceId: e.source_id,
      account: pick?.acct ? `${pick.acct.code} · ${pick.acct.name}` : null,
      amount: lines.reduce((s, l) => s + l.debit, 0),
      reversed: Boolean(e.reversed_by) || (e.source !== "void" && e.source !== "reversal" && Boolean(e.source_id && voided.has(e.source_id))),
    };
  });

  return {
    today,
    month,
    inbox,
    learnCard,
    setup,
    hasSst: Boolean(o?.sst_number),
    kpi: { cash: cash.reduce((s, a) => s + a.balance, 0), cashCount: cash.length, now, last },
    months,
    hasHistory: activeMonths >= 2,
    cash,
    owedToYou,
    youOwe,
    feed,
  };
}
