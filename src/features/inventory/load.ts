import "server-only";
import { todayMY } from "@/features/books/load";
import type { createSupabaseServerClient } from "@/shared/supabase/server";
import type {
  CostingMethod,
  EquityAccountChoice,
  LocationRow,
  StockItemRow,
  StocktakeLineRow,
  StocktakeStatus,
  StocktakeSummary,
  TransferRow,
  WritedownRow,
} from "./types";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
const sen = (v: unknown) => Math.round(Number(v ?? 0) * 100);
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export async function loadInventoryState(supabase: Supabase, orgId: string) {
  const [{ data: org }, { data: locs }, { data: items }, { data: moves }] = await Promise.all([
    supabase.from("organizations").select("inventory_enabled").eq("id", orgId).single(),
    supabase
      .from("inventory_locations")
      .select("id, name, is_default, archived_at")
      .eq("org_id", orgId)
      .order("is_default", { ascending: false })
      .order("name"),
    supabase
      .from("inventory_items")
      .select("id, name, sku, uom, costing_method, reorder_point, reorder_quantity")
      .eq("org_id", orgId)
      .order("name"),
    supabase
      .from("inventory_movements")
      .select("item_id, location_id, quantity_delta, value_delta")
      .eq("org_id", orgId),
  ]);

  const locMap = new Map<string, string>();
  for (const l of locs ?? []) locMap.set(l.id, l.name);

  const itemQty = new Map<string, number>();
  const itemVal = new Map<string, number>();
  const itemHasMoves = new Set<string>();
  const itemLocQty = new Map<string, Map<string, number>>();
  const locItems = new Map<string, Set<string>>();
  const locQty = new Map<string, number>();

  for (const m of moves ?? []) {
    const q = Number(m.quantity_delta ?? 0);
    const v = sen(m.value_delta);
    itemHasMoves.add(m.item_id);
    itemQty.set(m.item_id, (itemQty.get(m.item_id) ?? 0) + q);
    itemVal.set(m.item_id, (itemVal.get(m.item_id) ?? 0) + v);

    let perLoc = itemLocQty.get(m.item_id);
    if (!perLoc) {
      perLoc = new Map();
      itemLocQty.set(m.item_id, perLoc);
    }
    perLoc.set(m.location_id, (perLoc.get(m.location_id) ?? 0) + q);
    locQty.set(m.location_id, (locQty.get(m.location_id) ?? 0) + q);
  }

  for (const [itemId, perLoc] of itemLocQty) {
    for (const [locId, q] of perLoc) {
      if (q > 0) {
        let s = locItems.get(locId);
        if (!s) {
          s = new Set();
          locItems.set(locId, s);
        }
        s.add(itemId);
      }
    }
  }

  const locations: LocationRow[] = (locs ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    isDefault: Boolean(l.is_default),
    archivedAt: l.archived_at ?? null,
    itemCount: locItems.get(l.id)?.size ?? 0,
    totalQty: Math.round((locQty.get(l.id) ?? 0) * 10000) / 10000,
  }));

  const stockItems: StockItemRow[] = (items ?? []).map((it) => {
    const onHand = Math.round((itemQty.get(it.id) ?? 0) * 10000) / 10000;
    const valueSen = itemVal.get(it.id) ?? 0;
    const avgCostSen = onHand > 0 ? Math.round(valueSen / onHand) : 0;
    const rp = it.reorder_point != null ? Number(it.reorder_point) : null;
    const perLoc = itemLocQty.get(it.id) ?? new Map<string, number>();
    const byLocation = [...perLoc.entries()]
      .filter(([, q]) => q !== 0)
      .map(([locationId, q]) => ({
        locationId,
        locationName: locMap.get(locationId) ?? "–",
        qty: Math.round(q * 10000) / 10000,
      }));
    return {
      id: it.id,
      name: it.name,
      sku: it.sku ?? null,
      uom: it.uom,
      costingMethod: it.costing_method as CostingMethod,
      reorderPoint: rp,
      reorderQuantity: it.reorder_quantity != null ? Number(it.reorder_quantity) : null,
      onHand,
      valueSen,
      avgCostSen,
      isLow: rp !== null && onHand <= rp,
      hasMovements: itemHasMoves.has(it.id),
      byLocation,
    };
  });

  return {
    enabled: Boolean(org?.inventory_enabled),
    today: todayMY(),
    locations,
    activeLocations: locations.filter((l) => !l.archivedAt),
    items: stockItems,
    totalValueSen: stockItems.reduce((s, i) => s + i.valueSen, 0),
    lowStockCount: stockItems.filter((i) => i.isLow).length,
  };
}

export async function loadStocktakesList(supabase: Supabase, orgId: string): Promise<StocktakeSummary[]> {
  const { data } = await supabase
    .from("inventory_stocktakes")
    .select(
      "id, location_id, opened_on, status, memo, confirmed_on, journal_entry_id, inventory_locations(name), inventory_stocktake_lines(id, counted_quantity)",
    )
    .eq("org_id", orgId)
    .order("opened_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  return (data ?? []).map((s) => {
    const loc = one(s.inventory_locations as { name: string } | { name: string }[] | null);
    const lines = (s.inventory_stocktake_lines ?? []) as { id: string; counted_quantity: unknown }[];
    return {
      id: s.id,
      locationId: s.location_id,
      locationName: loc?.name ?? "–",
      openedOn: s.opened_on,
      status: s.status as StocktakeStatus,
      memo: s.memo ?? null,
      confirmedOn: s.confirmed_on ?? null,
      journalEntryId: s.journal_entry_id ?? null,
      lineCount: lines.length,
      countedCount: lines.filter((l) => l.counted_quantity !== null).length,
    };
  });
}

export async function loadStocktakeDetail(supabase: Supabase, orgId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data: s } = await supabase
    .from("inventory_stocktakes")
    .select(
      "id, location_id, opened_on, status, memo, confirmed_on, journal_entry_id, inventory_locations(name), inventory_stocktake_lines(id, item_id, book_quantity, unit_cost, counted_quantity, inventory_items(name, uom))",
    )
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (!s) return null;

  const loc = one(s.inventory_locations as { name: string } | { name: string }[] | null);
  type RawLine = {
    id: string;
    item_id: string;
    book_quantity: unknown;
    unit_cost: unknown;
    counted_quantity: unknown;
    inventory_items: { name: string; uom: string } | { name: string; uom: string }[] | null;
  };
  const lines: StocktakeLineRow[] = ((s.inventory_stocktake_lines ?? []) as RawLine[])
    .map((l) => {
      const it = one(l.inventory_items);
      return {
        id: l.id,
        itemId: l.item_id,
        itemName: it?.name ?? "–",
        uom: it?.uom ?? "unit",
        bookQty: Number(l.book_quantity ?? 0),
        unitCost: Number(l.unit_cost ?? 0),
        countedQty: l.counted_quantity != null ? Number(l.counted_quantity) : null,
      };
    })
    .sort((a, b) => a.itemName.localeCompare(b.itemName));

  return {
    id: s.id,
    locationName: loc?.name ?? "–",
    openedOn: s.opened_on,
    status: s.status as StocktakeStatus,
    memo: s.memo ?? null,
    confirmedOn: s.confirmed_on ?? null,
    journalEntryId: s.journal_entry_id ?? null,
    lines,
  };
}

export async function loadTransfersList(supabase: Supabase, orgId: string): Promise<TransferRow[]> {
  const { data } = await supabase
    .from("inventory_transfers")
    .select("id, from_location_id, to_location_id, occurred_on, memo, line_count")
    .eq("org_id", orgId)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);
  const { data: locs } = await supabase.from("inventory_locations").select("id, name").eq("org_id", orgId);
  const locMap = new Map((locs ?? []).map((l) => [l.id, l.name]));
  return (data ?? []).map((t) => ({
    id: t.id,
    fromName: locMap.get(t.from_location_id) ?? "–",
    toName: locMap.get(t.to_location_id) ?? "–",
    occurredOn: t.occurred_on,
    memo: t.memo ?? null,
    lineCount: t.line_count,
  }));
}

export async function loadWritedownsList(supabase: Supabase, orgId: string): Promise<WritedownRow[]> {
  const { data } = await supabase
    .from("inventory_writedowns")
    .select("id, occurred_on, amount, value_before, value_after, reason, journal_entry_id, inventory_items(name)")
    .eq("org_id", orgId)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []).map((w) => {
    const it = one(w.inventory_items as { name: string } | { name: string }[] | null);
    return {
      id: w.id,
      itemName: it?.name ?? "–",
      occurredOn: w.occurred_on,
      amountSen: sen(w.amount),
      valueBeforeSen: sen(w.value_before),
      valueAfterSen: sen(w.value_after),
      reason: w.reason,
      journalEntryId: w.journal_entry_id,
    };
  });
}

export async function loadEquityAccounts(supabase: Supabase, orgId: string): Promise<EquityAccountChoice[]> {
  const { data } = await supabase
    .from("accounts")
    .select("id, code, name, section")
    .eq("org_id", orgId)
    .eq("type", "equity")
    .eq("status", "active")
    .order("code");
  return (data ?? []).map((a) => ({ id: a.id, code: a.code, name: a.name, section: a.section }));
}
