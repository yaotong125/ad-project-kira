import "server-only";
import { todayMY } from "@/features/books/load";
import type { createSupabaseServerClient } from "@/shared/supabase/server";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type YearRow = { id: string; startsOn: string; endsOn: string; locked: boolean; periods: number };
export type PeriodEvent = { action: "close" | "reopen"; at: string; digest: string | null; reason: string | null };
export type PeriodRow = { id: string; startsOn: string; endsOn: string; status: "open" | "closing" | "closed"; locked: boolean; closedAt: string | null; events: PeriodEvent[] };

const minusYear = (iso: string) => `${Number(iso.slice(0, 4)) - 1}${iso.slice(4)}`;
const dayBefore = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

/** Everything /periods shows: years (newest first), periods (newest first) with their close events, and the next earlier year. */
export async function loadFinancialYear(supabase: Supabase, orgId: string) {
  const [{ data: org }, { data: years }, { data: periods }, { data: events }] = await Promise.all([
    supabase.from("organizations").select("books_start, legal_name").eq("id", orgId).single(),
    supabase.from("fiscal_years").select("id, starts_on, ends_on, locked").eq("org_id", orgId).order("starts_on", { ascending: false }),
    supabase.from("accounting_periods").select("id, fiscal_year_id, starts_on, ends_on, status").eq("org_id", orgId).order("starts_on", { ascending: false }),
    supabase.from("period_events").select("period_id, action, acted_at, digest, reason").eq("org_id", orgId).order("acted_at"),
  ]);
  const lockedYears = new Set((years ?? []).filter((y) => y.locked).map((y) => y.id));
  const yearRows: YearRow[] = (years ?? []).map((y) => ({
    id: y.id,
    startsOn: y.starts_on,
    endsOn: y.ends_on,
    locked: y.locked,
    periods: (periods ?? []).filter((p) => p.fiscal_year_id === y.id).length,
  }));
  const periodRows: PeriodRow[] = (periods ?? []).map((p) => {
    const ev = (events ?? []).filter((e) => e.period_id === p.id).map((e) => ({ action: e.action as PeriodEvent["action"], at: e.acted_at, digest: e.digest, reason: e.reason }));
    const lastClose = [...ev].reverse().find((e) => e.action === "close");
    return { id: p.id, startsOn: p.starts_on, endsOn: p.ends_on, status: p.status as PeriodRow["status"], locked: lockedYears.has(p.fiscal_year_id), closedAt: p.status === "closed" ? (lastClose?.at ?? null) : null, events: ev };
  });

  // The year "Add this year" would add, and whether the 6-year limit allows it (add_earlier_year checks again).
  const first = yearRows.at(-1);
  const today = todayMY();
  const current = [...yearRows].reverse().filter((y) => y.startsOn <= today).at(-1) ?? first;
  const earlier = first ? { startsOn: minusYear(first.startsOn), endsOn: dayBefore(first.startsOn) } : null;
  const limit = current ? `${Number(current.startsOn.slice(0, 4)) - 6}${current.startsOn.slice(4)}` : "";
  const tooFar = !!earlier && earlier.startsOn < limit;

  return { booksStart: org?.books_start ?? first?.startsOn ?? "", legalName: org?.legal_name ?? "", years: yearRows, periods: periodRows, earlier, tooFar };
}
