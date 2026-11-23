import "server-only";
import { todayMY } from "@/features/books/load";
import { toSen } from "@/features/books/money";
import type { createSupabaseServerClient } from "@/shared/supabase/server";
import type { AnyAccountOpt, CashAccountOpt, VoucherKind, VoucherLineRow, VoucherRow } from "./types";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const sen = (v: unknown) => toSen(String(v ?? 0)) ?? 0;

export async function loadVouchersData(supabase: Supabase, orgId: string, kind: VoucherKind) {
  const today = todayMY();
  const prefix = kind === "official_receipt" ? "OR" : "PV";

  const [{ data: rawVouchers }, { data: rawAccounts }, { data: suggested }] = await Promise.all([
    supabase
      .from("cash_vouchers")
      .select(
        "id, voucher_number, voucher_date, party_name, cash_account_id, notes, total, status, journal_entry_id, voided_on, void_reason, accounts!cash_vouchers_cash_account_id_fkey(code, name), cash_voucher_lines(line_no, description, amount, accounts(code, name))",
      )
      .eq("org_id", orgId)
      .eq("kind", kind)
      .order("voucher_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("accounts")
      .select("id, code, name, is_cash")
      .eq("org_id", orgId)
      .eq("status", "active")
      .order("code"),
    supabase.rpc("next_cash_doc_number", { p_org: orgId, p_prefix: prefix, p_on: today }),
  ]);

  const accounts: AnyAccountOpt[] = (rawAccounts ?? []).map((a) => ({
    id: a.id,
    code: a.code,
    name: a.name,
    isCash: Boolean(a.is_cash),
  }));
  const cashAccounts: CashAccountOpt[] = accounts
    .filter((a) => a.isCash)
    .map((a) => ({ id: a.id, code: a.code, name: a.name }));

  const vouchers: VoucherRow[] = (rawVouchers ?? []).map((v) => {
    const cash = one(v.accounts as { code: string; name: string } | { code: string; name: string }[] | null);
    type RawL = { line_no: number; description: string | null; amount: unknown; accounts: unknown };
    const lines: VoucherLineRow[] = ((v.cash_voucher_lines ?? []) as RawL[])
      .sort((a, b) => a.line_no - b.line_no)
      .map((l) => {
        const ac = one(l.accounts as { code: string; name: string } | { code: string; name: string }[] | null);
        return {
          lineNo: l.line_no,
          accountCode: ac?.code ?? "",
          accountName: ac?.name ?? "",
          description: l.description ?? "",
          amount: Number(l.amount ?? 0).toFixed(2),
        };
      });
    return {
      id: v.id,
      number: v.voucher_number,
      date: v.voucher_date,
      partyName: v.party_name ?? "",
      cashAccountId: v.cash_account_id,
      cashAccountLabel: cash ? `${cash.code} · ${cash.name}` : "-",
      notes: v.notes ?? "",
      totalSen: sen(v.total),
      status: v.status as "recorded" | "void",
      journalEntryId: v.journal_entry_id ?? null,
      voidedOn: v.voided_on ?? null,
      voidReason: v.void_reason ?? null,
      lines,
    };
  });

  return {
    today,
    suggestedNumber: (suggested as string) ?? `${prefix}-${today.slice(0, 4)}${today.slice(5, 7)}-001`,
    cashAccounts,
    accounts,
    vouchers,
  };
}
