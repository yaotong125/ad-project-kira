export type AccountType =
  | "asset"
  | "contra_asset"
  | "liability"
  | "contra_liability"
  | "equity"
  | "revenue"
  | "expense";

export type AccountRow = {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  subtype: "current" | "non_current" | "cash" | null;
  section: string;
  normalBalance: "debit" | "credit";
  isCash: boolean;
  parentId: string | null;
  status: "active" | "disabled";
  /** Kira posts to this account by code (receivables, payables, SST, bank charges, bank parent): no code or type change, disable or delete. */
  system: boolean;
};

/** Same list as public.system_account_codes() (migration 20261122001310). */
/** Fixed codes Kira posts to (SST, bank charges); the control accounts from Settings → Accounting are added per entity. */
export const SYSTEM_ACCOUNT_CODES = new Set(["300-1100", "400-1300", "400-1400", "400-1700", "900-0600"]);

export const ACCOUNT_GROUPS: { type: AccountType; label: string }[] = [
  { type: "asset", label: "Assets" },
  { type: "contra_asset", label: "Contra assets" },
  { type: "liability", label: "Liabilities" },
  { type: "contra_liability", label: "Contra liabilities" },
  { type: "equity", label: "Equity" },
  { type: "revenue", label: "Revenue" },
  { type: "expense", label: "Expenses" },
];

export const TYPE_LABELS: Record<AccountType, string> = {
  asset: "Asset",
  liability: "Liability",
  equity: "Equity",
  revenue: "Revenue",
  expense: "Expense",
  contra_asset: "Contra asset",
  contra_liability: "Contra liability",
};

export const SUBTYPE_LABELS: Record<string, string> = {
  current: "Current",
  non_current: "Non-current",
  cash: "Cash / bank",
};

export const SECTIONS_BY_TYPE: Record<AccountType, { value: string; label: string }[]> = {
  asset: [
    { value: "fixed_asset", label: "Fixed Assets" },
    { value: "current_asset", label: "Current Assets" },
  ],
  contra_asset: [
    { value: "fixed_asset", label: "Fixed Assets" },
    { value: "current_asset", label: "Current Assets" },
  ],
  liability: [
    { value: "current_liability", label: "Current Liabilities" },
    { value: "long_term_liability", label: "Long Term Liabilities" },
  ],
  contra_liability: [
    { value: "current_liability", label: "Current Liabilities" },
    { value: "long_term_liability", label: "Long Term Liabilities" },
  ],
  equity: [
    { value: "equity", label: "Capital" },
    { value: "retained_earnings", label: "Retained Earnings" },
  ],
  revenue: [
    { value: "sales", label: "Sales" },
    { value: "other_income", label: "Other Income" },
  ],
  expense: [
    { value: "cost_of_sales", label: "Cost of Goods Sold" },
    { value: "operating_expense", label: "Expenses" },
    { value: "other_expense", label: "Other Expenses" },
  ],
};

export function hasSubtype(t: AccountType): boolean {
  return t === "asset" || t === "liability" || t === "contra_asset" || t === "contra_liability";
}

export function defaultNormalBalance(t: AccountType): "debit" | "credit" {
  return t === "asset" || t === "expense" || t === "contra_liability" ? "debit" : "credit";
}
