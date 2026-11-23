export type MigrationSource = "csv" | "xero" | "ubs" | "manual";

export type AccountOption = {
  id: string;
  code: string;
  name: string;
  type: string;
  section: string;
};

export type TbMappingRow = {
  key: string;
  sourceCode: string;
  sourceName: string;
  accountId: string;
  debit: string;
  credit: string;
  matchedBy: "code" | "name" | "manual" | "none";
};

export type MigrationHistoryRow = {
  id: string;
  sourceSystem: MigrationSource;
  cutoverDate: string;
  foldedPnl: boolean;
  lineCount: number;
  totalSen: number;
  status: "committed" | "reversed";
  journalEntryId: string;
  reversalEntryId: string | null;
  notes: string | null;
  createdAt: string;
};

export const SOURCE_META: Record<
  MigrationSource,
  { title: string; badge: string; hint: string }
> = {
  csv: {
    title: "CSV / Excel",
    badge: "SQL Account · AutoCount · MYOB · Bukku",
    hint: "Download the CSV template, fill in closing balances as at the day before cutover, and upload.",
  },
  xero: {
    title: "Xero",
    badge: "Trial Balance CSV",
    hint: "Export Xero's Trial Balance report as CSV (Account Code, Account, Debit, Credit) and upload it here.",
  },
  ubs: {
    title: "Sage UBS",
    badge: "Trial Balance export",
    hint: "Export the Trial Balance from Sage UBS as CSV or tab-separated text and upload it here.",
  },
  manual: {
    title: "Manual entry",
    badge: "Key in directly",
    hint: "Add opening balance rows straight into the mapping table without preparing a file.",
  },
};
