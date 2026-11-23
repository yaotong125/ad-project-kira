"use server";

import { revalidatePath } from "next/cache";
import { booksError } from "@/features/books/db-errors";
import { appLang } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { rt } from "./copy";

/** lejar.ai's reconcile Server Actions (chunk 2kpch9e1ews-e). */
type Result = { ok: true } | { ok: false; error: string };

async function fail(code: string | undefined): Promise<Result> {
  const lang = await appLang();
  const map: Record<string, Parameters<typeof rt>[1]> = {
    line_required: "reconcile.errors.lineRequired",
    date_required: "reconcile.errors.dateRequired",
    save_required: "reconcile.errors.saveRequired",
    account_not_found: "reconcile.errors.accountNotFound",
  };
  return { ok: false, error: code && map[code] ? rt(lang, map[code]) : booksError({ message: code }) };
}

function refresh(slug: string) {
  revalidatePath(`/${slug}/reconcile`);
  revalidatePath(`/${slug}/learn`);
}

export async function markLineReconciledAction(orgSlug: string, lineId: string, date: string): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("mark_line_reconciled", { p_slug: orgSlug, p_line: lineId, p_date: date });
  if (error) return fail(error.message);
  refresh(orgSlug);
  return { ok: true };
}

export async function unmarkLineReconciledAction(orgSlug: string, lineId: string): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("unmark_line_reconciled", { p_slug: orgSlug, p_line: lineId });
  if (error) return fail(error.message);
  refresh(orgSlug);
  return { ok: true };
}

export async function saveReconciliationAction(orgSlug: string, account: string, date: string, balance: string): Promise<Result> {
  if (!account || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^-?\d+(\.\d{1,2})?$/.test(balance)) return fail("save_required");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_reconciliation", { p_slug: orgSlug, p_account: account, p_date: date, p_balance: balance });
  if (error) return fail(error.message);
  refresh(orgSlug);
  return { ok: true };
}
