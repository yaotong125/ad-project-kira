import "server-only";
import { todayMY } from "@/features/books/load";
import { documentInfo } from "@/features/books/doc-info";
import { Ledger } from "@/features/reports/engine";
import type { createSupabaseServerClient } from "@/shared/supabase/server";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
const sen = (v: unknown) => Math.round(Number(v) * 100);

export type Period = { id: string; startsOn: string; endsOn: string; status: "open" | "closing" | "closed" };
export type TbRow = { code: string; name: string; debit: number; credit: number };
export type EntryRow = {
  id: string;
  date: string;
  number: string | null;
  memo: string | null;
  source: string;
  sourceId: string | null;
  party: string | null;
  docs: string | null;
  amount: number;
  voided: boolean;
  voidReason: string | null;
  reversedBy: string | null;
  reversalOf: string | null;
};

/** dd/mm/yyyy, as lejar.ai prints period dates. */
export const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export async function loadPeriods(supabase: Supabase, orgId: string): Promise<Period[]> {
  const { data } = await supabase.from("accounting_periods").select("id, starts_on, ends_on, status").eq("org_id", orgId).order("starts_on");
  return (data ?? []).map((p) => ({ id: p.id, startsOn: p.starts_on, endsOn: p.ends_on, status: p.status as Period["status"] }));
}

/**
 * The period range: ?fromPeriodId= / ?toPeriodId= like lejar.ai. Without them Kira opens the period
 * holding today (Lejar opened its latest period, which is usually empty).
 */
export function resolveRange(periods: Period[], fromId?: string, toId?: string) {
  const today = todayMY();
  const current = periods.find((p) => p.startsOn <= today && today <= p.endsOn) ?? (periods.at(-1) && periods.at(-1)!.endsOn < today ? periods.at(-1) : periods[0]);
  let from: Period | undefined = periods.find((p) => p.id === fromId) ?? current;
  let to: Period | undefined = periods.find((p) => p.id === toId) ?? (fromId && !toId ? from : current);
  // Moving one end past the other pulls the other end along (the closing period decides Close / Reopen).
  if (from && to && from.startsOn > to.startsOn) {
    if (toId && periods.find((p) => p.id === toId)) from = to;
    else to = from;
  }
  return { from, to };
}

/** lejar.ai's trial balance for the closing period: each account's balance on its Debit or Credit side. */
export async function trialBalance(supabase: Supabase, orgId: string, asOf: string) {
  const ledger = await Ledger.load(supabase, orgId, asOf);
  const bal = ledger.balances(asOf);
  const rows: TbRow[] = ledger.accounts
    .map((a) => ({ code: a.code, name: a.name, net: bal.get(a.id) ?? 0 }))
    .filter((r) => r.net !== 0)
    .map((r) => ({ code: r.code, name: r.name, debit: r.net > 0 ? r.net : 0, credit: r.net < 0 ? -r.net : 0 }));
  const debit = rows.reduce((s, r) => s + r.debit, 0);
  const credit = rows.reduce((s, r) => s + r.credit, 0);
  return { rows, debit, credit, balanced: debit === credit };
}

export async function loadEntries(supabase: Supabase, orgId: string, from: string, to: string, hideVoided: boolean) {
  let q = supabase
    .from("journal_entries")
    .select("id, entry_number, occurred_on, memo, source, source_id, voided_at, void_reason, reversed_by, reversal_of, journal_lines(debit), voided_journal_lines(debit)", { count: "exact" })
    .eq("org_id", orgId)
    .gte("occurred_on", from)
    .lte("occurred_on", to)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(300);
  if (hideVoided) q = q.is("voided_at", null);
  const { data, count } = await q;
  const rows = data ?? [];
  const info = await documentInfo(supabase, rows.map((e) => e.source_id));
  const entries: EntryRow[] = rows.map((e) => {
    const lines = ((e.voided_at ? e.voided_journal_lines : e.journal_lines) ?? []) as { debit: unknown }[];
    return {
      id: e.id,
      date: e.occurred_on,
      number: e.entry_number,
      memo: e.memo,
      source: e.source,
      sourceId: e.source_id,
      party: (e.source_id && info.get(e.source_id)?.party) || null,
      docs: (e.source_id && info.get(e.source_id)?.docs) || null,
      amount: lines.reduce((s, l) => s + sen(l.debit), 0),
      voided: Boolean(e.voided_at),
      voidReason: e.void_reason,
      reversedBy: e.reversed_by,
      reversalOf: e.reversal_of,
    };
  });
  const { count: posted } = await supabase
    .from("journal_entries")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .is("voided_at", null)
    .gte("occurred_on", from)
    .lte("occurred_on", to);
  return { entries, total: count ?? entries.length, posted: posted ?? 0 };
}

/** Where an entry's source document lives in Kira. */
export function sourceHref(slug: string, e: { source: string; sourceId: string | null; reversalOf?: string | null }) {
  const base = `/${slug}`;
  switch (e.source) {
    case "invoice":
      return e.sourceId ? `${base}/invoices/${e.sourceId}` : null;
    case "bill":
      return `${base}/bills`;
    case "receipt":
      return `${base}/payments-received`;
    case "payment":
      return `${base}/payments-made`;
    case "bank":
      return `${base}/import`;
    case "official_receipt":
      return `${base}/official-receipts`;
    case "payment_voucher":
      return `${base}/expenses`;
    case "transfer":
      return e.sourceId ? `${base}/banking/transfers/${e.sourceId}` : `${base}/banking/transfers`;
    case "depreciation":
    case "disposal":
      return e.sourceId ? `${base}/fixed-assets/${e.sourceId}` : `${base}/fixed-assets`;
    case "amortisation":
      return e.sourceId ? `${base}/prepaid-amortisations/${e.sourceId}` : `${base}/prepaid-amortisations`;
    case "opening_balance":
      return `${base}/migrate`;
    case "reversal":
      return e.sourceId ? `${base}/ledger/entries/${e.sourceId}` : null;
    default:
      return null;
  }
}

export const SOURCE_LABEL: Record<string, [string, string]> = {
  invoice: ["Invoice", "Invois"],
  bill: ["Bill", "Bil"],
  receipt: ["Receipt", "Resit"],
  payment: ["Payment", "Bayaran"],
  bank: ["Bank import", "Import bank"],
  manual: ["Journal", "Jurnal"],
  void: ["Void", "Batal"],
  reversal: ["Reversal", "Pembalikan"],
  note: ["Credit / debit note", "Nota kredit / debit"],
  sst: ["Deemed SST", "SST disifatkan"],
  credit: ["Customer credit", "Kredit pelanggan"],
  official_receipt: ["Official receipt", "Resit rasmi"],
  payment_voucher: ["Payment voucher", "Baucar bayaran"],
  transfer: ["Bank transfer", "Pindahan bank"],
  depreciation: ["Depreciation", "Susut nilai"],
  disposal: ["Asset disposal", "Pelupusan aset"],
  amortisation: ["Amortisation", "Pelunasan"],
  opening_balance: ["Opening balance", "Baki pembukaan"],
};
