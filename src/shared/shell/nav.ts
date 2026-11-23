import type { ShellTextKey } from "./copy";

/**
 * Sidebar navigation, mirroring lejar.ai's nav config (module 70331, read 2026-11-22) in its
 * "chat enabled" form, which is what the user's Lejar account shows: Ask Kira on top, a "Bring in"
 * group, Bank import under Bring in. Icons are the Lucide icons Lejar renders. `built` marks the
 * pages Kira has; the rest open a "coming soon" page until their slice is built.
 */

export type NavIcon =
  | "House" | "Zap" | "Inbox" | "FileUp" | "ArrowRightLeft" | "FileText" | "HandCoins" | "Users"
  | "FileCheckCorner" | "FilePenLine" | "Truck" | "FileMinus" | "Coins" | "Repeat" | "Receipt"
  | "Building2" | "Boxes" | "Warehouse" | "ClipboardCheck" | "Landmark" | "ArrowLeftRight"
  | "ChartColumn" | "TrendingUp" | "List" | "ScrollText" | "BookOpen" | "Percent" | "CalendarClock"
  | "CalendarCheck" | "CreditCard" | "Settings";

/** A translation key, or a fixed label (Lejar does not translate "e-Invois" and "SST"). */
export type NavLabel = ShellTextKey | { text: string };

export type NavItem = {
  path: string; // relative to /{slug}; may carry ?query or #hash
  label: NavLabel;
  icon: NavIcon;
  ai?: boolean; // AI badge + AI-coloured icon
  built?: boolean;
};

export type NavGroup = { label?: ShellTextKey; collapsible?: boolean; items: NavItem[] };

/** Items shown in a collapsed group before "N more…" (lejar.ai: es.S = 3). */
export const VISIBLE_IN_GROUP = 3;

export const CHAT_PATH = "chat";

export const NAV: NavGroup[] = [
  {
    items: [
      { path: "", label: "shell.nav.dashboard", icon: "House" },
      { path: "quick-invoices", label: "shell.nav.quickInvoices", icon: "Zap" },
    ],
  },
  {
    label: "shell.nav.group.bringIn",
    collapsible: true,
    items: [
      { path: "inbox", label: "shell.nav.inbox", icon: "Inbox", ai: true },
      { path: "import", label: "shell.nav.bankImport", icon: "FileUp" },
      { path: "migrate", label: "shell.nav.migrate", icon: "ArrowRightLeft" },
    ],
  },
  {
    label: "shell.nav.group.sales",
    collapsible: true,
    items: [
      { path: "invoices", label: "shell.nav.invoices", icon: "FileText" },
      { path: "payments-received", label: "shell.nav.paymentsReceived", icon: "HandCoins" },
      { path: "contacts?type=customer", label: "shell.nav.customers", icon: "Users" },
      { path: "myinvois", label: { text: "e-Invois" }, icon: "FileCheckCorner" },
      { path: "quotes", label: "shell.nav.quotes", icon: "FilePenLine" },
      { path: "delivery-orders", label: "shell.nav.deliveryOrders", icon: "Truck" },
      { path: "notes", label: "shell.nav.notes", icon: "FileMinus" },
      { path: "official-receipts", label: "shell.nav.officialReceipts", icon: "Coins" },
      { path: "recurring-invoices", label: "shell.nav.recurringInvoices", icon: "Repeat" },
    ],
  },
  {
    label: "shell.nav.group.purchases",
    collapsible: true,
    items: [
      { path: "bills", label: "shell.nav.bills", icon: "Receipt" },
      { path: "expenses", label: "shell.nav.paymentVouchers", icon: "Coins" },
      { path: "contacts?type=supplier", label: "shell.nav.suppliers", icon: "Building2" },
      { path: "payments-made", label: "shell.nav.paymentsMade", icon: "HandCoins" },
      { path: "bills/notes", label: "shell.nav.billNotes", icon: "FileMinus" },
      { path: "recurring-bills", label: "shell.nav.recurringBills", icon: "Repeat" },
    ],
  },
  {
    label: "inventory.ui.nav.group",
    collapsible: true,
    items: [
      { path: "inventory", label: "inventory.ui.nav.stock", icon: "Boxes" },
      { path: "inventory/locations", label: "inventory.ui.nav.locations", icon: "Warehouse" },
      { path: "inventory/stocktakes", label: "inventory.ui.nav.stocktakes", icon: "ClipboardCheck" },
      { path: "inventory/transfers", label: "inventory.ui.nav.transfers", icon: "Truck" },
      { path: "inventory/writedowns", label: "inventory.ui.nav.writedowns", icon: "FileMinus" },
      { path: "inventory/opening-import", label: "inventory.ui.nav.openingImport", icon: "FileUp" },
    ],
  },
  {
    label: "shell.nav.group.banking",
    collapsible: true,
    items: [
      { path: "reconcile", label: "shell.nav.reconcile", icon: "Landmark" },
      { path: "banking/transfers", label: "shell.nav.transfers", icon: "ArrowLeftRight" },
    ],
  },
  {
    items: [
      { path: "reports", label: "shell.nav.reports", icon: "ChartColumn" },
      { path: "reports#profit-and-loss", label: "shell.nav.profitAndLoss", icon: "TrendingUp" },
    ],
  },
  {
    label: "shell.nav.group.accounting",
    collapsible: true,
    items: [
      { path: "ledger", label: "shell.nav.ledger", icon: "List" },
      { path: "journal-entries", label: "shell.nav.journalEntries", icon: "ScrollText" },
      { path: "accounts", label: "shell.nav.accounts", icon: "BookOpen" },
      { path: "sst", label: { text: "SST" }, icon: "Percent" },
      { path: "fixed-assets", label: "shell.nav.fixedAssets", icon: "Boxes" },
      { path: "prepaid-amortisations", label: "shell.nav.prepaidAmortisation", icon: "CalendarClock" },
      { path: "periods", label: "shell.nav.financialYear", icon: "CalendarCheck" },
    ],
  },
  {
    // lejar.ai hides Billing when billing is off; Kira has no plans yet, so only Settings shows.
    items: [{ path: "settings/profile", label: "shell.nav.settings", icon: "Settings" }],
  },
];

/** Paths (first segment) that have a real page in Kira. */
export const BUILT_PATHS = new Set(["learn", "inbox", "bills", "journal-entries", "contacts", "invoices", "import", "reconcile", "chat", "reports", "payments-received", "payments-made", "", "ledger", "settings", "accounts", "sst", "periods", "notes", "quotes", "delivery-orders", "recurring-invoices", "recurring-bills", "official-receipts", "expenses", "banking", "fixed-assets", "prepaid-amortisations", "quick-invoices", "migrate", "myinvois", "inventory"]);

/** The nav label for a path, used by "coming soon" pages. */
export function navLabelFor(path: string): NavLabel | undefined {
  const clean = path.split(/[?#]/)[0];
  for (const g of NAV) for (const i of g.items) if (i.path.split(/[?#]/)[0] === clean) return i.label;
  return undefined;
}
