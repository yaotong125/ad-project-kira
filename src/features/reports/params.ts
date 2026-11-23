import "server-only";
import { todayMY } from "@/features/books/load";
import type { createSupabaseServerClient } from "@/shared/supabase/server";
import { Ledger, compareRange } from "./engine";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
const isDate = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
export const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/**
 * lejar.ai's defaults (observed): P&L from the start of the current financial year to today, balance
 * sheet as of today, compare "None". Returns the entity, dates and a ledger loaded up to the latest date.
 */
export async function reportContext(supabase: Supabase, slug: string, q: { from?: string; to?: string; asOf?: string; compare?: string }) {
  const { data: org } = await supabase.from("organizations").select("id, slug, legal_name, books_start").eq("slug", slug).maybeSingle();
  if (!org) return null;
  const today = todayMY();
  const { data: years } = await supabase.from("fiscal_years").select("starts_on, ends_on").eq("org_id", org.id).order("starts_on");
  const fy = (years ?? []).find((y) => y.starts_on <= today && today <= y.ends_on) ?? (years ?? [])[(years ?? []).length - 1] ?? null;
  const to = isDate(q.to) ? q.to : today;
  const from = isDate(q.from) && q.from <= to ? q.from : (fy?.starts_on ?? org.books_start);
  const asOf = isDate(q.asOf) ? q.asOf : today;
  const compare = q.compare === "prior_period" || q.compare === "last_year" ? q.compare : "none";
  const range = compare === "none" ? null : compareRange(compare, from, to, org.books_start);
  const ledger = await Ledger.load(supabase, org.id, [to, asOf].sort()[1]);
  return { org, today, fy, from, to, asOf, compare, range, ledger, lastYearAvailable: compareRange("last_year", from, to, org.books_start) !== null };
}
