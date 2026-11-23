import "server-only";
import { controlAccounts } from "@/features/books/load";
import type { createSupabaseServerClient } from "@/shared/supabase/server";
import { SYSTEM_ACCOUNT_CODES, type AccountRow, type AccountType } from "./types";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export async function loadChartAccounts(supabase: Supabase, orgId: string): Promise<AccountRow[]> {
  const [{ data }, control] = await Promise.all([
    supabase
    .from("accounts")
    .select("id, code, name, type, subtype, section, normal_balance, is_cash, parent_id, status")
    .eq("org_id", orgId)
    .order("code"),
    controlAccounts(supabase, orgId),
  ]);
  const controlIds = new Set(Object.values(control.ids).filter(Boolean));
  return (data ?? []).map((a) => ({
    id: a.id,
    code: a.code,
    name: a.name,
    type: a.type as AccountType,
    subtype: (a.subtype as AccountRow["subtype"]) ?? null,
    section: a.section,
    normalBalance: (a.normal_balance as "debit" | "credit") ?? "debit",
    isCash: Boolean(a.is_cash),
    parentId: a.parent_id ?? null,
    status: (a.status as "active" | "disabled") ?? "active",
    system: SYSTEM_ACCOUNT_CODES.has(a.code) || controlIds.has(a.id),
  }));
}
