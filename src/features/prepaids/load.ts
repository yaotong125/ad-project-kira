import "server-only";
import { todayMY } from "@/features/books/load";
import { toSen } from "@/features/books/money";
import type { createSupabaseServerClient } from "@/shared/supabase/server";
import type { AccountChoice, PrepaidLineRow, PrepaidLineStatus, PrepaidScheduleRow, PrepaidStatus } from "./types";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const sen = (v: unknown) => toSen(String(v ?? 0)) ?? 0;

function acctLabel(v: unknown): string {
  const a = one(v as { code: string; name: string } | { code: string; name: string }[] | null);
  return a ? `${a.code} · ${a.name}` : "-";
}

function mapSchedule(r: Record<string, unknown>): PrepaidScheduleRow {
  const total = sen(r.total_amount);
  const amort = sen(r.amortised_amount);
  const lines = (r.prepaid_schedule_lines ?? []) as { status: string }[];
  return {
    id: String(r.id),
    name: String(r.name),
    prepaidAccountLabel: acctLabel(r.prepaid_acct),
    expenseAccountLabel: acctLabel(r.exp_acct),
    totalSen: total,
    amortisedSen: amort,
    remainingSen: Math.max(0, total - amort),
    periodsCount: Number(r.periods_count ?? 0),
    postedCount: lines.filter((l) => l.status === "posted").length,
    startDate: String(r.start_date),
    autoPost: Boolean(r.auto_post),
    status: (r.status as PrepaidStatus) ?? "active",
    notes: String(r.notes ?? ""),
  };
}

export async function loadPrepaidsData(supabase: Supabase, orgId: string) {
  const today = todayMY();
  const [{ data: raw }, { data: accts }] = await Promise.all([
    supabase
      .from("prepaid_schedules")
      .select(
        "id, name, total_amount, amortised_amount, periods_count, start_date, auto_post, status, notes, prepaid_acct:accounts!prepaid_schedules_prepaid_account_id_fkey(code, name), exp_acct:accounts!prepaid_schedules_expense_account_id_fkey(code, name), prepaid_schedule_lines(status)",
      )
      .eq("org_id", orgId)
      .order("created_at", { ascending: false }),
    supabase
      .from("accounts")
      .select("id, code, name, type, is_cash")
      .eq("org_id", orgId)
      .eq("status", "active")
      .in("type", ["asset", "expense"])
      .order("code"),
  ]);

  const schedules = (raw ?? []).map((r) => mapSchedule(r as unknown as Record<string, unknown>));
  const live = schedules.filter((s) => s.status !== "cancelled");
  const totalSen = live.reduce((acc, s) => acc + s.totalSen, 0);
  const amortisedSen = live.reduce((acc, s) => acc + s.amortisedSen, 0);

  return {
    today,
    schedules,
    accounts: (accts ?? []).map((a): AccountChoice => ({
      id: a.id,
      code: a.code,
      name: a.name,
      type: a.type,
      isCash: Boolean(a.is_cash),
    })),
    stats: {
      totalSen,
      amortisedSen,
      remainingSen: Math.max(0, totalSen - amortisedSen),
      activeCount: schedules.filter((s) => s.status === "active").length,
    },
  };
}

export async function loadPrepaidDetail(supabase: Supabase, orgId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [{ data: raw }, { data: lines }] = await Promise.all([
    supabase
      .from("prepaid_schedules")
      .select(
        "id, name, total_amount, amortised_amount, periods_count, start_date, auto_post, status, notes, prepaid_acct:accounts!prepaid_schedules_prepaid_account_id_fkey(code, name), exp_acct:accounts!prepaid_schedules_expense_account_id_fkey(code, name), prepaid_schedule_lines(status)",
      )
      .eq("org_id", orgId)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("prepaid_schedule_lines")
      .select("id, period_no, scheduled_on, amount, status, journal_entry_id")
      .eq("org_id", orgId)
      .eq("schedule_id", id)
      .order("period_no"),
  ]);
  if (!raw) return null;
  return {
    schedule: mapSchedule(raw as unknown as Record<string, unknown>),
    lines: (lines ?? []).map((l): PrepaidLineRow => ({
      id: l.id,
      periodNo: l.period_no,
      scheduledOn: l.scheduled_on,
      amountSen: sen(l.amount),
      status: l.status as PrepaidLineStatus,
      journalEntryId: l.journal_entry_id ?? null,
    })),
  };
}
