export type CashAccountOpt = { id: string; code: string; name: string };

export type TransferRow = {
  id: string;
  number: string;
  date: string;
  fromAccountId: string;
  fromAccountLabel: string;
  toAccountId: string;
  toAccountLabel: string;
  amountSen: number;
  feeSen: number;
  reference: string;
  status: "recorded" | "void";
  journalEntryId: string | null;
  voidEntryId: string | null;
  voidedOn: string | null;
  voidReason: string | null;
};
