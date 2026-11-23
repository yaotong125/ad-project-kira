"use server";

import { revalidatePath } from "next/cache";
import { booksError } from "@/features/books/db-errors";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import type { AccountType } from "./types";

type Res = { ok: true } | { ok: false; error: string };

function message(e: { message?: string; code?: string } | null): string {
  switch (e?.message ?? "") {
    case "invalid_code":
      return "Account code must be between 1 and 30 characters.";
    case "invalid_name":
      return "Account name must be between 1 and 120 characters.";
    case "invalid_type":
      return "Choose a valid account type.";
    case "invalid_subtype":
      return "Choose a valid subtype.";
    case "invalid_section":
      return "Choose a valid statement section.";
    case "duplicate_code":
      return "An account with that code already exists.";
    case "no_free_fa_code":
      return "No free 200-XX00 fixed-asset codes remain. Add the account manually instead.";
    case "cash_assets_only":
      return "Only asset accounts can be marked as cash or bank accounts.";
    case "has_children":
      return "Delete or unlink its child accounts first.";
    case "in_use":
      return "This account is used by existing transactions or documents. Disable it instead.";
    case "system_account":
      return "Kira posts to this account automatically, so its code and type stay fixed and it cannot be disabled or deleted. You can still rename it.";
    case "not_found":
      return "That account no longer exists. Reload the page.";
    default:
      return booksError(e);
  }
}

function refresh(slug: string) {
  for (const p of ["", "accounts", "ledger", "reports", "invoices", "bills", "journal-entries", "reconcile", "payments-received", "payments-made"]) {
    revalidatePath(p ? `/${slug}/${p}` : `/${slug}`);
  }
}

export async function createAccountAction(
  orgSlug: string,
  input: {
    code: string;
    name: string;
    type: AccountType;
    subtype: string;
    normalBalance?: "debit" | "credit";
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_account", {
    p_slug: orgSlug,
    p_code: input.code,
    p_name: input.name,
    p_type: input.type,
    p_subtype: input.subtype,
    p_section: "",
    p_normal_balance: input.normalBalance ?? "",
  });
  if (error) return { ok: false, error: message(error) };
  refresh(orgSlug);
  return { ok: true, id: String(data) };
}

export async function createFixedAssetPairAction(
  orgSlug: string,
  name: string,
): Promise<{ ok: true; assetCode: string; depCode: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_fixed_asset_pair", {
    p_slug: orgSlug,
    p_name: name,
  });
  if (error) return { ok: false, error: message(error) };
  refresh(orgSlug);
  const r = data as { assetCode: string; depCode: string };
  return { ok: true, assetCode: r.assetCode, depCode: r.depCode };
}

export async function updateAccountAction(
  orgSlug: string,
  id: string,
  patch: {
    code?: string;
    name?: string;
    type?: AccountType;
    subtype?: string;
    normalBalance?: "debit" | "credit";
    section?: string;
    isCash?: boolean;
    status?: "active" | "disabled";
  },
): Promise<Res> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_account", {
    p_slug: orgSlug,
    p_id: id,
    p_patch: patch,
  });
  if (error) return { ok: false, error: message(error) };
  refresh(orgSlug);
  return { ok: true };
}

export async function deleteAccountAction(orgSlug: string, id: string): Promise<Res> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_account", {
    p_slug: orgSlug,
    p_id: id,
  });
  if (error) return { ok: false, error: message(error) };
  refresh(orgSlug);
  return { ok: true };
}
