import "server-only";
import { todayMY } from "@/features/books/load";
import { toSen } from "@/features/books/money";
import type { createSupabaseServerClient } from "@/shared/supabase/server";
import type { CashAccountOpt, TransferRow } from "./types";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const sen = (v: unknown) => toSen(String(v ?? 0)) ?? 0;

function mapRow(t: Record<string, unknown>): TransferRow {
  const from = one(t.from_account as { code: string; name: string } | { code: string; name: string }[] | null);
  const to = one(t.to_account as { code: string; name: string } | { code: string; name: string }[] | null);
  return {
    id: String(t.id),
    number: String(t.transfer_number),
    date: String(t.transfer_date),
    fromAccountId: String(t.from_account_id),
    fromAccountLabel: from ? `${from.code} · ${from.name}` : "-",
    toAccountId: String(t.to_account_id),
    toAccountLabel: to ? `${to.code} · ${to.name}` : "-",
    amountSen: sen(t.amount),
    feeSen: sen(t.fee),
    reference: String(t.reference ?? ""),
    status: (t.status as "recorded" | "void") ?? "recorded",
    journalEntryId: (t.journal_entry_id as string | null) ?? null,
    voidEntryId: (t.void_entry_id as string | null) ?? null,
    voidedOn: (t.voided_on as string | null) ?? null,
    voidReason: (t.void_reason as string | null) ?? null,
  };
}

export async function loadTransfersData(supabase: Supabase, orgId: string) {
  const today = todayMY();
  const [{ data: raw }, { data: cash }] = await Promise.all([
    supabase
      .from("bank_transfers")
      .select(
        "id, transfer_number, transfer_date, from_account_id, to_account_id, amount, fee, reference, status, journal_entry_id, void_entry_id, voided_on, void_reason, from_account:accounts!bank_transfers_from_account_id_fkey(code, name), to_account:accounts!bank_transfers_to_account_id_fkey(code, name)",
      )
      .eq("org_id", orgId)
      .order("transfer_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("accounts")
      .select("id, code, name")
      .eq("org_id", orgId)
      .eq("status", "active")
      .eq("is_cash", true)
      .order("code"),
  ]);

  return {
    today,
    cashAccounts: (cash ?? []) as CashAccountOpt[],
    transfers: (raw ?? []).map((r) => mapRow(r as unknown as Record<string, unknown>)),
  };
}

export async function loadTransferDetail(supabase: Supabase, orgId: string, id: string): Promise<TransferRow | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data } = await supabase
    .from("bank_transfers")
    .select(
      "id, transfer_number, transfer_date, from_account_id, to_account_id, amount, fee, reference, status, journal_entry_id, void_entry_id, voided_on, void_reason, from_account:accounts!bank_transfers_from_account_id_fkey(code, name), to_account:accounts!bank_transfers_to_account_id_fkey(code, name)",
    )
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  return data ? mapRow(data as unknown as Record<string, unknown>) : null;
}
