import "server-only";
import { todayMY } from "@/features/books/load";
import { toSen } from "@/features/books/money";
import type { createSupabaseServerClient } from "@/shared/supabase/server";
import type { AssetAccountOpt, AssetStatus, DepreciationRunRow, FixedAssetRow } from "./types";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const sen = (v: unknown) => toSen(String(v ?? 0)) ?? 0;

function acctLabel(v: unknown): string {
  const a = one(v as { code: string; name: string } | { code: string; name: string }[] | null);
  return a ? `${a.code} · ${a.name}` : "-";
}

function mapAsset(r: Record<string, unknown>): FixedAssetRow {
  const cost = sen(r.cost);
  const accum = sen(r.accumulated_depreciation);
  return {
    id: String(r.id),
    assetCode: String(r.asset_code),
    name: String(r.name),
    assetAccountLabel: acctLabel(r.asset_acct),
    accumDepAccountLabel: acctLabel(r.accum_acct),
    depExpenseAccountLabel: acctLabel(r.exp_acct),
    purchaseDate: String(r.purchase_date),
    depreciationStart: String(r.depreciation_start),
    costSen: cost,
    residualSen: sen(r.residual_value),
    usefulLifeMonths: Number(r.useful_life_months ?? 0),
    accumDepSen: accum,
    nbvSen: Math.max(0, cost - accum),
    status: (r.status as AssetStatus) ?? "active",
    disposedOn: (r.disposed_on as string | null) ?? null,
    disposalProceedsSen: r.disposal_proceeds != null ? sen(r.disposal_proceeds) : null,
    disposalEntryId: (r.disposal_entry_id as string | null) ?? null,
    notes: String(r.notes ?? ""),
  };
}

export async function loadFixedAssetsData(supabase: Supabase, orgId: string) {
  const today = todayMY();
  const [{ data: rawAssets }, { data: rawAccts }] = await Promise.all([
    supabase
      .from("fixed_assets")
      .select(
        "id, asset_code, name, purchase_date, depreciation_start, cost, residual_value, useful_life_months, accumulated_depreciation, status, disposed_on, disposal_proceeds, disposal_entry_id, notes, asset_acct:accounts!fixed_assets_asset_account_id_fkey(code, name), accum_acct:accounts!fixed_assets_accum_dep_account_id_fkey(code, name), exp_acct:accounts!fixed_assets_dep_expense_account_id_fkey(code, name)",
      )
      .eq("org_id", orgId)
      .order("asset_code"),
    supabase
      .from("accounts")
      .select("id, code, name, type, subtype, normal_balance, parent_id, is_cash")
      .eq("org_id", orgId)
      .eq("status", "active")
      .order("code"),
  ]);

  const assets = (rawAssets ?? []).map((r) => mapAsset(r as unknown as Record<string, unknown>));
  const accounts: AssetAccountOpt[] = (rawAccts ?? []).map((a) => ({
    id: a.id,
    code: a.code,
    name: a.name,
    type: a.type,
    subtype: a.subtype ?? null,
    normalBalance: a.normal_balance,
    parentId: a.parent_id ?? null,
    isCash: Boolean(a.is_cash),
  }));

  const live = assets.filter((a) => a.status !== "disposed");
  const totalCostSen = live.reduce((s, a) => s + a.costSen, 0);
  const totalAccumSen = live.reduce((s, a) => s + a.accumDepSen, 0);

  return {
    today,
    assets,
    accounts,
    stats: {
      totalCostSen,
      totalAccumSen,
      totalNbvSen: Math.max(0, totalCostSen - totalAccumSen),
      activeCount: assets.filter((a) => a.status === "active").length,
      fullyDepCount: assets.filter((a) => a.status === "fully_depreciated").length,
      disposedCount: assets.filter((a) => a.status === "disposed").length,
    },
  };
}

export async function loadFixedAssetDetail(supabase: Supabase, orgId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [{ data: raw }, { data: runs }, { data: cash }] = await Promise.all([
    supabase
      .from("fixed_assets")
      .select(
        "id, asset_code, name, purchase_date, depreciation_start, cost, residual_value, useful_life_months, accumulated_depreciation, status, disposed_on, disposal_proceeds, disposal_entry_id, notes, asset_acct:accounts!fixed_assets_asset_account_id_fkey(code, name), accum_acct:accounts!fixed_assets_accum_dep_account_id_fkey(code, name), exp_acct:accounts!fixed_assets_dep_expense_account_id_fkey(code, name)",
      )
      .eq("org_id", orgId)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("depreciation_runs")
      .select("id, period_month, posted_on, amount, journal_entry_id")
      .eq("org_id", orgId)
      .eq("asset_id", id)
      .order("period_month"),
    supabase.from("accounts").select("id, code, name").eq("org_id", orgId).eq("status", "active").eq("is_cash", true).order("code"),
  ]);
  if (!raw) return null;
  return {
    today: todayMY(),
    asset: mapAsset(raw as unknown as Record<string, unknown>),
    runs: (runs ?? []).map((r): DepreciationRunRow => ({
      id: r.id,
      periodMonth: r.period_month,
      postedOn: r.posted_on,
      amountSen: sen(r.amount),
      journalEntryId: r.journal_entry_id,
    })),
    cashAccounts: (cash ?? []) as { id: string; code: string; name: string }[],
  };
}
