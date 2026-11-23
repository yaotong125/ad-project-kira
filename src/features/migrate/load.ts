import "server-only";
import { todayMY } from "@/features/books/load";
import type { createSupabaseServerClient } from "@/shared/supabase/server";
import type { AccountOption, MigrationHistoryRow, MigrationSource } from "./types";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
const sen = (v: unknown) => Math.round(Number(v ?? 0) * 100);

export async function loadMigrateData(supabase: Supabase, orgId: string) {
  const [{ data: org }, { data: accts }, { data: periods }, { data: hist }] = await Promise.all([
    supabase.from("organizations").select("books_start, fiscal_year_end, chart_mode").eq("id", orgId).single(),
    supabase
      .from("accounts")
      .select("id, code, name, type, section")
      .eq("org_id", orgId)
      .eq("status", "active")
      .order("code"),
    supabase
      .from("accounting_periods")
      .select("starts_on, ends_on, status")
      .eq("org_id", orgId)
      .eq("status", "open")
      .order("starts_on"),
    supabase
      .from("opening_migrations")
      .select(
        "id, source_system, cutover_date, folded_pnl, line_count, total_amount, status, journal_entry_id, reversal_entry_id, notes, created_at",
      )
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const accounts: AccountOption[] = (accts ?? []).map((a) => ({
    id: a.id,
    code: a.code,
    name: a.name,
    type: a.type,
    section: a.section,
  }));

  const retainedEarnings = accounts.find((a) => a.section === "retained_earnings") ?? null;
  const openPeriods = periods ?? [];
  const today = todayMY();
  const booksStart = org?.books_start ?? today;
  const booksStartOpen = openPeriods.some((p) => p.starts_on <= booksStart && booksStart <= p.ends_on);
  const defaultCutover = booksStartOpen ? booksStart : (openPeriods[0]?.starts_on ?? today);

  const history: MigrationHistoryRow[] = (hist ?? []).map((h) => ({
    id: h.id,
    sourceSystem: h.source_system as MigrationSource,
    cutoverDate: h.cutover_date,
    foldedPnl: Boolean(h.folded_pnl),
    lineCount: h.line_count,
    totalSen: sen(h.total_amount),
    status: h.status as "committed" | "reversed",
    journalEntryId: h.journal_entry_id,
    reversalEntryId: h.reversal_entry_id ?? null,
    notes: h.notes ?? null,
    createdAt: h.created_at,
  }));

  return {
    accounts,
    retainedEarningsLabel: retainedEarnings ? `${retainedEarnings.code} · ${retainedEarnings.name}` : "Retained Earnings",
    defaultCutover,
    booksStart,
    openRange:
      openPeriods.length > 0
        ? { min: openPeriods[0].starts_on, max: openPeriods[openPeriods.length - 1].ends_on }
        : null,
    history,
  };
}
