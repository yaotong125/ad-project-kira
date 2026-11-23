export type CostingMethod = "fifo" | "moving_average";
export type StocktakeStatus = "open" | "confirmed" | "cancelled";

export const COSTING_LABEL: Record<CostingMethod, string> = {
  fifo: "FIFO",
  moving_average: "Moving weighted average",
};

export const SAMPLE_OPENING_STOCK_CSV = [
  "item,quantity,unit_cost,location,uom,costing_method",
  "Arabica Coffee Beans 1kg,40,35.00,Main store,bag,moving_average",
  "Oat Milk 1L,60,8.50,Main store,carton,fifo",
].join("\n");

export type LocationRow = {
  id: string;
  name: string;
  isDefault: boolean;
  archivedAt: string | null;
  itemCount: number;
  totalQty: number;
};

export type StockItemRow = {
  id: string;
  name: string;
  sku: string | null;
  uom: string;
  costingMethod: CostingMethod;
  reorderPoint: number | null;
  reorderQuantity: number | null;
  onHand: number;
  valueSen: number;
  avgCostSen: number;
  isLow: boolean;
  hasMovements: boolean;
  byLocation: { locationId: string; locationName: string; qty: number }[];
};

export type StocktakeSummary = {
  id: string;
  locationId: string;
  locationName: string;
  openedOn: string;
  status: StocktakeStatus;
  memo: string | null;
  confirmedOn: string | null;
  journalEntryId: string | null;
  lineCount: number;
  countedCount: number;
};

export type StocktakeLineRow = {
  id: string;
  itemId: string;
  itemName: string;
  uom: string;
  bookQty: number;
  unitCost: number;
  countedQty: number | null;
};

export type TransferRow = {
  id: string;
  fromName: string;
  toName: string;
  occurredOn: string;
  memo: string | null;
  lineCount: number;
};

export type WritedownRow = {
  id: string;
  itemName: string;
  occurredOn: string;
  amountSen: number;
  valueBeforeSen: number;
  valueAfterSen: number;
  reason: string;
  journalEntryId: string;
};

export type EquityAccountChoice = {
  id: string;
  code: string;
  name: string;
  section: string;
};
