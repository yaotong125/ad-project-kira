"use server";

import { revalidatePath } from "next/cache";
import { booksError } from "@/features/books/db-errors";
import { createSupabaseServerClient } from "@/shared/supabase/server";

function message(e: { message?: string } | null): string {
  switch (e?.message?.trim() ?? "") {
    case "invalid_name":
      return "Schedule name must be between 2 and 150 characters.";
    case "invalid_amount":
      return "Total prepaid amount must be greater than zero.";
    case "invalid_periods":
      return "Enter between 2 and 120 monthly periods.";
    case "start_date_required":
      return "Start date is required.";
    case "invalid_prepaid_account":
      return "Choose an active prepaid asset account.";
    case "invalid_expense_account":
      return "Choose an active expense account.";
    case "already_posted":
      return "This period is already posted.";
    case "schedule_not_active":
      return "This schedule is no longer active.";
    case "not_found":
      return "Schedule or period not found.";
    default:
      return booksError(e);
  }
}

function refresh(slug: string, id?: string) {
  for (const p of ["prepaid-amortisations", "ledger", "reports", ""]) {
    revalidatePath(p ? `/${slug}/${p}` : `/${slug}`);
  }
  if (id) revalidatePath(`/${slug}/prepaid-amortisations/${id}`);
}

export async function createPrepaidAction(
  orgSlug: string,
  input: {
    name: string;
    prepaidAccountId: string;
    expenseAccountId: string;
    totalAmount: string;
    periodsCount: string;
    startDate: string;
    autoPost: boolean;
    notes: string;
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_prepaid_schedule", { p_slug: orgSlug, p: input });
  if (error) return { ok: false, error: message(error) };
  refresh(orgSlug);
  return { ok: true, id: String(data) };
}

export async function postPrepaidLineAction(
  orgSlug: string,
  scheduleId: string,
  lineId: string,
): Promise<{ ok: true; entryId: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("post_prepaid_line", { p_slug: orgSlug, p_line_id: lineId });
  if (error) return { ok: false, error: message(error) };
  refresh(orgSlug, scheduleId);
  return { ok: true, entryId: String(data) };
}

export async function postDuePrepaidsAction(
  orgSlug: string,
  asOf: string,
): Promise<{ ok: true; posted: number; skipped: number; amount: number } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("post_due_prepaids", { p_slug: orgSlug, p_as_of: asOf || null });
  if (error) return { ok: false, error: message(error) };
  refresh(orgSlug);
  const r = data as { posted: number; skipped: number; amount: number };
  return { ok: true, posted: r.posted ?? 0, skipped: r.skipped ?? 0, amount: Number(r.amount ?? 0) };
}

export async function cancelPrepaidAction(
  orgSlug: string,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_prepaid_schedule", { p_slug: orgSlug, p_id: id });
  if (error) return { ok: false, error: message(error) };
  refresh(orgSlug, id);
  return { ok: true };
}
