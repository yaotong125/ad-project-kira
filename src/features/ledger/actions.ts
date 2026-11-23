"use server";

import { revalidatePath } from "next/cache";
import { booksError } from "@/features/books/db-errors";
import { createSupabaseServerClient } from "@/shared/supabase/server";

/** lejar.ai's ledger Server Actions (chunk 246kkikeeb2eh): close / reopen a period, reverse or void an entry. */
export type TieOut = {
  as_of: string;
  lines: { kind: string; account_id: string; account_code: string; account_name: string; ledger_minor: string; sub_ledger_minor: string; difference_minor: string }[];
  flags: unknown[];
};
export type CloseResult = { ok: true; tieOut?: TieOut } | { ok: false; error?: string; tieOut?: TieOut; canOverride?: boolean };

const SOURCE_NAME: Record<string, string> = { invoice: "invoice", bill: "bill", receipt: "receipt", payment: "payment", bank: "bank import", void: "void", reversal: "reversal" };

function message(e: { message?: string; details?: string; code?: string } | null): string {
  const code = e?.message ?? "";
  const d = e?.details ?? "";
  switch (code) {
    case "not_allowed":
      return "Only an owner or admin can close or reopen periods.";
    case "earlier_open":
      return `Close the earlier period ${d} first. Periods close in order.`;
    case "later_closed":
      return `Reopen the later period ${d} first. Periods reopen latest first.`;
    case "not_open":
      return "This period is not open any more. Reload the page.";
    case "not_closed":
      return "This period is not closed. Reload the page.";
    case "year_locked":
      return "Its financial year is locked, so this period cannot be reopened.";
    case "reason_required":
      return "Reason is required.";
    case "use_document":
      return `This entry comes from a ${SOURCE_NAME[d] ?? d}. Void the ${SOURCE_NAME[d] ?? "document"} from its own page instead, so its status stays right.`;
    case "voided":
      return "This entry is already void.";
    case "already_reversed":
      return "This entry has already been reversed.";
    case "has_reversal":
      return "This entry has a reversal. Void or keep the reversal instead.";
    case "reverse_date":
      return "The reversal date cannot be before the entry's date.";
    case "reconciled":
      return "A line of this entry is reconciled against a bank statement. Unmatch it on Reconcile first.";
    case "not_found":
      return "That entry or period no longer exists. Reload the page.";
    default:
      return booksError(e);
  }
}

function refresh(slug: string) {
  for (const p of ["ledger", "journal-entries", "reports", ""]) revalidatePath(`/${slug}/${p}`.replace(/\/$/, ""));
}

export async function closePeriodAction(orgSlug: string, periodId: string, overrideReason?: string): Promise<CloseResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("close_period", { p_slug: orgSlug, p_period: periodId, p_override_reason: overrideReason ?? "" });
  if (error) return { ok: false, error: message(error) };
  const r = data as { ok: boolean; tieOut?: TieOut; canOverride?: boolean };
  if (r.ok) refresh(orgSlug);
  return r.ok ? { ok: true, tieOut: r.tieOut ?? undefined } : { ok: false, tieOut: r.tieOut, canOverride: r.canOverride };
}

export async function reopenPeriodAction(orgSlug: string, periodId: string, reason: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!reason.trim()) return { ok: false, error: "Reopen requires a reason." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reopen_period", { p_slug: orgSlug, p_period: periodId, p_reason: reason });
  if (error) return { ok: false, error: message(error) };
  refresh(orgSlug);
  return { ok: true };
}

export async function reverseEntryAction(orgSlug: string, entryId: string, occurredOn: string, reason: string): Promise<{ ok: true; entryId: string; occurredOn: string } | { ok: false; error: string }> {
  if (!reason.trim()) return { ok: false, error: "Reason is required." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("reverse_journal_entry", { p_slug: orgSlug, p_entry: entryId, p_on: occurredOn, p_reason: reason });
  if (error) return { ok: false, error: message(error) };
  refresh(orgSlug);
  const r = data as { entryId: string; occurredOn: string };
  return { ok: true, entryId: r.entryId, occurredOn: r.occurredOn };
}

export async function voidEntryAction(orgSlug: string, entryId: string, reason: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!reason.trim()) return { ok: false, error: "Reason is required." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("void_journal_entry", { p_slug: orgSlug, p_entry: entryId, p_reason: reason });
  if (error) return { ok: false, error: message(error) };
  refresh(orgSlug);
  return { ok: true };
}
