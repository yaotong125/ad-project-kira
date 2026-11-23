"use server";

import { revalidatePath } from "next/cache";
import { booksError } from "@/features/books/db-errors";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import type { CostingMethod } from "./types";

const MESSAGES: Record<string, string> = {
  unauthenticated: "Your session expired. Sign in again.",
  admin_only: "Only an owner or admin can turn on stock tracking.",
  invalid_name: "Enter a valid name.",
  duplicate_location: "A stock location with that name already exists.",
  duplicate_item: "A stock item with that name already exists.",
  not_found: "Record not found.",
  location_frozen: "This location is frozen by an open stocktake. Confirm or cancel the stocktake first.",
  location_not_empty: "A location can only be archived once nothing is held there.",
  invalid_qty: "Quantity must be greater than zero.",
  invalid_cost: "Unit cost must be zero or more.",
  costing_locked: "The costing method is fixed once the item has its first movement.",
  date_required: "Choose a date.",
  invalid_counter_account: "Pick an active equity account as the counter account.",
  no_rows: "Add at least one opening stock row.",
  invalid_item: "Item name is required on every row.",
  unknown_location: "Location not found. Add it under Stock locations first.",
  different_locations: "Pick two different stock locations for a transfer.",
  no_lines: "Add at least one transfer line.",
  unknown_item: "Stock item not found.",
  insufficient_stock: "Not enough stock available at the source location.",
  already_open: "A stocktake is already open at this location.",
  not_open: "This stocktake is already closed.",
  reason_required: "Enter a reason for the write-down.",
  invalid_amount: "Enter a write-down amount greater than zero.",
  exceeds_carrying: "Write-down amount cannot be more than what the item is carried at.",
};

function mapErr(err: { code?: string; message?: string; details?: string } | null): string {
  const msg = err?.message ?? "";
  for (const [k, v] of Object.entries(MESSAGES)) {
    if (msg.includes(k)) {
      if (k === "unknown_location" && err?.details) return `Unknown location "${err.details}". Add it under Stock locations first.`;
      return v;
    }
  }
  return booksError(err);
}

function revalidateInventory(slug: string) {
  revalidatePath(`/${slug}/inventory`);
  revalidatePath(`/${slug}/inventory/locations`);
  revalidatePath(`/${slug}/inventory/stocktakes`);
  revalidatePath(`/${slug}/inventory/transfers`);
  revalidatePath(`/${slug}/inventory/writedowns`);
  revalidatePath(`/${slug}/inventory/opening-import`);
  revalidatePath(`/${slug}/ledger`);
}

export async function enableInventoryAction(orgSlug: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("enable_inventory", { p_slug: orgSlug });
  if (error) return { ok: false, error: mapErr(error) };
  revalidateInventory(orgSlug);
  revalidatePath(`/${orgSlug}/accounts`);
  return { ok: true };
}

export async function createLocationAction(orgSlug: string, name: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_inventory_location", { p_slug: orgSlug, p_name: name });
  if (error) return { ok: false, error: mapErr(error) };
  revalidateInventory(orgSlug);
  return { ok: true };
}

export async function setDefaultLocationAction(orgSlug: string, id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_default_inventory_location", { p_slug: orgSlug, p_id: id });
  if (error) return { ok: false, error: mapErr(error) };
  revalidateInventory(orgSlug);
  return { ok: true };
}

export async function archiveLocationAction(orgSlug: string, id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("archive_inventory_location", { p_slug: orgSlug, p_id: id });
  if (error) return { ok: false, error: mapErr(error) };
  revalidateInventory(orgSlug);
  return { ok: true };
}

export async function createStockItemAction(
  orgSlug: string,
  input: {
    name: string;
    sku: string;
    uom: string;
    costingMethod: CostingMethod;
    reorderPoint: string;
    reorderQuantity: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_inventory_item", { p_slug: orgSlug, p: input });
  if (error) return { ok: false, error: mapErr(error) };
  revalidateInventory(orgSlug);
  return { ok: true };
}

export async function updateStockItemAction(
  orgSlug: string,
  id: string,
  input: { uom: string; costingMethod: CostingMethod; reorderPoint: string; reorderQuantity: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_inventory_item", { p_slug: orgSlug, p_id: id, p: input });
  if (error) return { ok: false, error: mapErr(error) };
  revalidateInventory(orgSlug);
  return { ok: true };
}

export async function importOpeningStockAction(
  orgSlug: string,
  input: {
    openingDate: string;
    counterAccountId: string;
    defaultCosting: CostingMethod;
    rows: { item: string; quantity: string; unitCost: string; location: string; uom?: string; costingMethod?: string }[];
  },
): Promise<
  | { ok: true; itemsCreated: number; movements: number; totalCost: number; journalEntryId: string | null }
  | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("import_opening_stock", { p_slug: orgSlug, p: input });
  if (error) return { ok: false, error: mapErr(error) };
  revalidateInventory(orgSlug);
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    itemsCreated: Number(r.itemsCreated ?? 0),
    movements: Number(r.movements ?? 0),
    totalCost: Number(r.totalCost ?? 0),
    journalEntryId: r.journalEntryId ? String(r.journalEntryId) : null,
  };
}

export async function recordTransferAction(
  orgSlug: string,
  input: {
    fromLocationId: string;
    toLocationId: string;
    occurredOn: string;
    memo: string;
    lines: { itemId: string; quantity: string }[];
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_stock_transfer", { p_slug: orgSlug, p: input });
  if (error) return { ok: false, error: mapErr(error) };
  revalidateInventory(orgSlug);
  return { ok: true };
}

export async function openStocktakeAction(
  orgSlug: string,
  locationId: string,
  openedOn: string,
  memo: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("open_stocktake", {
    p_slug: orgSlug,
    p_location_id: locationId,
    p_on: openedOn,
    p_memo: memo,
  });
  if (error) return { ok: false, error: mapErr(error) };
  revalidateInventory(orgSlug);
  return { ok: true, id: String(data ?? "") };
}

export async function saveStocktakeCountsAction(
  orgSlug: string,
  stocktakeId: string,
  counts: { lineId: string; counted: string }[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_stocktake_counts", {
    p_slug: orgSlug,
    p_id: stocktakeId,
    p_counts: counts,
  });
  if (error) return { ok: false, error: mapErr(error) };
  revalidatePath(`/${orgSlug}/inventory/stocktakes/${stocktakeId}`);
  return { ok: true };
}

export async function confirmStocktakeAction(
  orgSlug: string,
  stocktakeId: string,
): Promise<{ ok: true; adjustments: number; netValue: number; journalEntryId: string | null } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("confirm_stocktake", { p_slug: orgSlug, p_id: stocktakeId });
  if (error) return { ok: false, error: mapErr(error) };
  revalidateInventory(orgSlug);
  revalidatePath(`/${orgSlug}/inventory/stocktakes/${stocktakeId}`);
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    adjustments: Number(r.adjustments ?? 0),
    netValue: Number(r.netValue ?? 0),
    journalEntryId: r.journalEntryId ? String(r.journalEntryId) : null,
  };
}

export async function cancelStocktakeAction(orgSlug: string, stocktakeId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_stocktake", { p_slug: orgSlug, p_id: stocktakeId });
  if (error) return { ok: false, error: mapErr(error) };
  revalidateInventory(orgSlug);
  revalidatePath(`/${orgSlug}/inventory/stocktakes/${stocktakeId}`);
  return { ok: true };
}

export async function recordWritedownAction(
  orgSlug: string,
  input: { itemId: string; occurredOn: string; amount: string; reason: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_stock_writedown", { p_slug: orgSlug, p: input });
  if (error) return { ok: false, error: mapErr(error) };
  revalidateInventory(orgSlug);
  return { ok: true };
}
