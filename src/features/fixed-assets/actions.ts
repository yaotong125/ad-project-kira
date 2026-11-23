"use server";

import { revalidatePath } from "next/cache";
import { booksError } from "@/features/books/db-errors";
import { createSupabaseServerClient } from "@/shared/supabase/server";

function message(e: { message?: string } | null): string {
  switch (e?.message?.trim() ?? "") {
    case "invalid_name":
      return "Asset name must be between 2 and 150 characters.";
    case "purchase_date_required":
      return "Purchase date is required.";
    case "invalid_cost":
      return "Asset cost must be greater than zero.";
    case "invalid_residual":
      return "Residual value must be zero or more, and less than cost.";
    case "invalid_life":
      return "Useful life must be between 1 and 600 months.";
    case "invalid_asset_account":
      return "Choose an active fixed-asset account.";
    case "invalid_accum_account":
      return "Choose an active accumulated depreciation account.";
    case "invalid_expense_account":
      return "Choose an active depreciation expense account.";
    case "duplicate_asset_code":
      return "An asset with that code already exists.";
    case "disposal_date_required":
      return "Disposal date is required.";
    case "invalid_proceeds":
      return "Disposal proceeds cannot be negative.";
    case "before_purchase":
      return "Disposal date cannot be before the purchase date.";
    case "already_disposed":
      return "This asset is already disposed.";
    case "choose_cash":
      return "Choose the bank or cash account that received the proceeds.";
    case "no_disposal_account":
      return "Add a Gain on Disposal of Assets account (900-0400) before disposing with a gain or loss.";
    default:
      return booksError(e);
  }
}

function refresh(slug: string, id?: string) {
  for (const p of ["fixed-assets", "ledger", "reports", ""]) {
    revalidatePath(p ? `/${slug}/${p}` : `/${slug}`);
  }
  if (id) revalidatePath(`/${slug}/fixed-assets/${id}`);
}

export async function createFixedAssetAction(
  orgSlug: string,
  input: {
    assetCode: string;
    name: string;
    assetAccountId: string;
    accumDepAccountId: string;
    depExpenseAccountId: string;
    purchaseDate: string;
    depreciationStart: string;
    cost: string;
    residualValue: string;
    usefulLifeMonths: string;
    notes: string;
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_fixed_asset", { p_slug: orgSlug, p: input });
  if (error) return { ok: false, error: message(error) };
  refresh(orgSlug);
  return { ok: true, id: String(data) };
}

export async function runDepreciationAction(
  orgSlug: string,
  asOf: string,
): Promise<{ ok: true; assets: number; posted: number; skipped: number; amount: number } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("run_depreciation", { p_slug: orgSlug, p_as_of: asOf || null });
  if (error) return { ok: false, error: message(error) };
  refresh(orgSlug);
  const r = data as { assets: number; posted: number; skipped: number; amount: number };
  return { ok: true, assets: r.assets ?? 0, posted: r.posted ?? 0, skipped: r.skipped ?? 0, amount: Number(r.amount ?? 0) };
}

export async function disposeFixedAssetAction(
  orgSlug: string,
  id: string,
  on: string,
  proceeds: string,
  cashAccountId: string,
  notes: string,
): Promise<{ ok: true; entryId: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("dispose_fixed_asset", {
    p_slug: orgSlug,
    p_id: id,
    p_on: on,
    p_proceeds: Number(proceeds || 0),
    p_cash_account_id: Number(proceeds || 0) > 0 ? cashAccountId : null,
    p_notes: notes || null,
  });
  if (error) return { ok: false, error: message(error) };
  refresh(orgSlug, id);
  return { ok: true, entryId: String(data) };
}
