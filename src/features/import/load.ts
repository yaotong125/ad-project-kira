import "server-only";
import type { createSupabaseServerClient } from "@/shared/supabase/server";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type ReviewLine = {
  id: string;
  position: number;
  date: string;
  description: string;
  reference: string | null;
  amount: string;
  direction: "in" | "out";
  balance: string | null;
  status: "draft" | "recorded" | "matched" | "skipped" | "duplicate";
  edited: boolean;
  accountCode: string | null;
  suggestedCode: string | null;
  confidence: number | null;
  reasoning: string | null;
  categorised: boolean;
};
export type Settle = { lineId: string; docId: string; number: string; party: string; kind: "invoice" | "bill" };
export type Match = { lineId: string; entryId: string; date: string; memo: string | null; daysApart: number };
export type StatementInfo = {
  id: string;
  fileName: string;
  bank: string;
  account: { code: string; name: string };
  periodStart: string | null;
  periodEnd: string | null;
  warnings: string[];
  createdAt: string;
};

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
const MATCH_DAYS = 7;

/**
 * A statement with its lines and, for each draft line, an entry already in the books on the same bank
 * account with the same amount and direction within 7 days (lejar.ai: "Matched existing entry").
 */
export async function loadStatement(supabase: Supabase, orgId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data: s } = await supabase
    .from("bank_statements")
    .select("id, file_name, bank, account_id, period_start, period_end, warnings, created_at, accounts(code, name)")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (!s) return null;
  const { data: rows } = await supabase
    .from("bank_statement_lines")
    .select("id, position, txn_date, description, reference, amount, direction, balance, status, edited, suggestion_confidence, suggestion_reason, account:accounts!bank_statement_lines_account_id_fkey(code), suggested:accounts!bank_statement_lines_suggested_account_id_fkey(code)")
    .eq("statement_id", id)
    .order("position");
  const lines: ReviewLine[] = (rows ?? []).map((r) => ({
    id: r.id,
    position: r.position,
    date: r.txn_date,
    description: r.description,
    reference: r.reference,
    amount: Number(r.amount).toFixed(2),
    direction: r.direction,
    balance: r.balance === null ? null : Number(r.balance).toFixed(2),
    status: r.status,
    edited: r.edited,
    accountCode: one(r.account as { code: string } | { code: string }[] | null)?.code ?? null,
    suggestedCode: one(r.suggested as { code: string } | { code: string }[] | null)?.code ?? null,
    confidence: r.suggestion_confidence === null ? null : Number(r.suggestion_confidence),
    reasoning: r.suggestion_reason,
    categorised: r.suggestion_reason !== null || r.suggestion_confidence !== null,
  }));

  // Matches: journal lines on this bank account not created by a statement line and not already matched.
  const drafts = lines.filter((l) => l.status === "draft");
  const matches: Match[] = [];
  if (drafts.length > 0) {
    const dates = drafts.map((l) => l.date).sort();
    const shift = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
    const [{ data: jl }, { data: taken }] = await Promise.all([
      supabase
        .from("journal_lines")
        .select("debit, credit, entry_id, journal_entries!inner(id, occurred_on, memo, source)")
        .eq("org_id", orgId)
        .eq("account_id", s.account_id)
        .gte("journal_entries.occurred_on", shift(dates[0], -MATCH_DAYS))
        .lte("journal_entries.occurred_on", shift(dates[dates.length - 1], MATCH_DAYS))
        .neq("journal_entries.source", "bank"),
      supabase.from("bank_statement_lines").select("matched_entry_id").eq("org_id", orgId).not("matched_entry_id", "is", null),
    ]);
    const used = new Set((taken ?? []).map((t) => t.matched_entry_id));
    for (const l of drafts) {
      let best: Match | null = null;
      for (const j of jl ?? []) {
        const e = one(j.journal_entries as { id: string; occurred_on: string; memo: string | null } | { id: string; occurred_on: string; memo: string | null }[]);
        if (!e || used.has(e.id)) continue;
        const amt = Number(l.direction === "in" ? j.debit : j.credit);
        if (amt !== Number(l.amount)) continue;
        const days = Math.abs(Date.parse(e.occurred_on) - Date.parse(l.date)) / 86400000;
        if (days > MATCH_DAYS) continue;
        if (!best || days < best.daysApart) best = { lineId: l.id, entryId: e.id, date: e.occurred_on, memo: e.memo, daysApart: days };
      }
      if (best) {
        used.add(best.entryId);
        matches.push(best);
      }
    }
  }
  // lejar.ai: "Record as receipt against {number}" / "Record as payment against {number}" when the line's
  // amount equals what an open invoice (money in) or bill (money out) still owes.
  const settles: Settle[] = [];
  const unmatched = drafts.filter((l) => !matches.some((m) => m.lineId === l.id));
  if (unmatched.length > 0) {
    const [{ data: invs }, { data: bills }] = await Promise.all([
      supabase.from("invoices").select("id, invoice_number, total, paid_amount, amount_due, contacts(name)").eq("org_id", orgId).eq("status", "open"),
      supabase.from("bills").select("id, bill_number, total, paid_amount, amount_due, contacts(name)").eq("org_id", orgId).eq("status", "open"),
    ]);
    const taken = new Set<string>();
    for (const l of unmatched) {
      const pool = l.direction === "in" ? (invs ?? []).map((i) => ({ id: i.id, number: i.invoice_number, owed: Number(i.amount_due), contacts: i.contacts, kind: "invoice" as const }))
        : (bills ?? []).map((b) => ({ id: b.id, number: b.bill_number, owed: Number(b.amount_due), contacts: b.contacts, kind: "bill" as const }));
      const hit = pool.find((d) => !taken.has(d.id) && Math.abs(d.owed - Number(l.amount)) < 0.005);
      if (hit) {
        taken.add(hit.id);
        settles.push({ lineId: l.id, docId: hit.id, number: hit.number, party: one(hit.contacts as { name: string } | { name: string }[] | null)?.name ?? "", kind: hit.kind });
      }
    }
  }
  const acct = one(s.accounts as { code: string; name: string } | { code: string; name: string }[] | null);
  const info: StatementInfo = {
    id: s.id,
    fileName: s.file_name,
    bank: s.bank,
    account: acct ?? { code: "", name: "" },
    periodStart: s.period_start,
    periodEnd: s.period_end,
    warnings: s.warnings ?? [],
    createdAt: s.created_at,
  };
  return { info, lines, matches, settles };
}
