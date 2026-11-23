export type VoucherKind = "official_receipt" | "payment_voucher";

export type VoucherLineRow = {
  lineNo: number;
  accountCode: string;
  accountName: string;
  description: string;
  amount: string;
};

export type VoucherRow = {
  id: string;
  number: string;
  date: string;
  partyName: string;
  cashAccountId: string;
  cashAccountLabel: string;
  notes: string;
  totalSen: number;
  status: "recorded" | "void";
  journalEntryId: string | null;
  voidedOn: string | null;
  voidReason: string | null;
  lines: VoucherLineRow[];
};

export type CashAccountOpt = { id: string; code: string; name: string };
export type AnyAccountOpt = { id: string; code: string; name: string; isCash: boolean };
