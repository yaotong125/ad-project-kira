export type PrepaidStatus = "active" | "completed" | "cancelled";
export type PrepaidLineStatus = "pending" | "posted" | "cancelled";

export type PrepaidScheduleRow = {
  id: string;
  name: string;
  prepaidAccountLabel: string;
  expenseAccountLabel: string;
  totalSen: number;
  amortisedSen: number;
  remainingSen: number;
  periodsCount: number;
  postedCount: number;
  startDate: string;
  autoPost: boolean;
  status: PrepaidStatus;
  notes: string;
};

export type PrepaidLineRow = {
  id: string;
  periodNo: number;
  scheduledOn: string;
  amountSen: number;
  status: PrepaidLineStatus;
  journalEntryId: string | null;
};

export type AccountChoice = { id: string; code: string; name: string; type: string; isCash: boolean };
