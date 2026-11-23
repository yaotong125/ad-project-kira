"use server";

import { revalidatePath } from "next/cache";
import { booksError } from "@/features/books/db-errors";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import type { MigrationSource } from "./types";

const MESSAGES: Record<string, string> = {
  unauthenticated: "Your session expired. Sign in again.",
  admin_only: "Only an owner or admin can commit or reverse opening balances.",
  date_required: "Choose a cutover date.",
  no_lines: "Add at least two balanced opening lines with amounts greater than zero.",
  negative_amount: "Amounts cannot be negative.",
  both_sides: "A line can have either a debit or a credit, not both.",
  unknown_account: "Map every non-zero line to an active Kira account.",
  no_retained_earnings: "No active Retained Earnings account found in your chart of accounts.",
  unbalanced: "Total debits must equal total credits before committing.",
  not_found: "Migration record not found.",
  already_reversed: "This opening balance entry has already been reversed.",
};

function mapErr(err: { code?: string; message?: string } | null): string {
  const msg = err?.message ?? "";
  for (const [k, v] of Object.entries(MESSAGES)) {
    if (msg.includes(k)) return v;
  }
  return booksError(err);
}

export async function commitOpeningBalancesAction(
  orgSlug: string,
  input: {
    sourceSystem: MigrationSource;
    cutoverDate: string;
    foldPnl: boolean;
    notes: string;
    lines: { accountId: string; debit: string; credit: string; description?: string }[];
  },
): Promise<{ ok: true; id: string; journalEntryId: string; lineCount: number; totalAmount: number } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("commit_opening_balances", {
    p_slug: orgSlug,
    p: input,
  });
  if (error) return { ok: false, error: mapErr(error) };
  revalidatePath(`/${orgSlug}/migrate`);
  revalidatePath(`/${orgSlug}/ledger`);
  revalidatePath(`/${orgSlug}/reports`);
  revalidatePath(`/${orgSlug}`);
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    id: String(r.id ?? ""),
    journalEntryId: String(r.journalEntryId ?? ""),
    lineCount: Number(r.lineCount ?? 0),
    totalAmount: Number(r.totalAmount ?? 0),
  };
}

export async function reverseOpeningMigrationAction(
  orgSlug: string,
  id: string,
): Promise<{ ok: true; reversalEntryId: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("reverse_opening_migration", {
    p_slug: orgSlug,
    p_id: id,
  });
  if (error) return { ok: false, error: mapErr(error) };
  revalidatePath(`/${orgSlug}/migrate`);
  revalidatePath(`/${orgSlug}/ledger`);
  revalidatePath(`/${orgSlug}/reports`);
  revalidatePath(`/${orgSlug}`);
  return { ok: true, reversalEntryId: String(data ?? "") };
}
