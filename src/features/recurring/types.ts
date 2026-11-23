export type RecurringKind = "invoice" | "bill";
export type Frequency = "weekly" | "monthly" | "quarterly" | "yearly";
export type RecurringStatus = "active" | "paused" | "completed" | "cancelled";
export type RunStatus = "draft" | "recorded" | "failed";

export type RecurringLineInput = {
  description: string;
  accountCode: string;
  amount: string;
  taxCode: string;
};

export type RecurringTemplateRow = {
  id: string;
  name: string;
  contactId: string;
  contactName: string;
  frequency: Frequency;
  intervalCount: number;
  startDate: string;
  endDate: string | null;
  occurrencesLimit: number | null;
  occurrencesGenerated: number;
  nextRunOn: string | null;
  dueOffsetDays: number;
  numberPrefix: string;
  autoRecord: boolean;
  notes: string | null;
  status: RecurringStatus;
  totalSen: number;
};

export type RecurringRunRow = {
  id: string;
  templateId: string;
  templateName: string;
  scheduledOn: string;
  status: RunStatus;
  docId: string | null;
  docNumber: string | null;
  error: string | null;
  ranAt: string;
};

export type ContactOpt = { id: string; name: string };
export type AccountOpt = { code: string; name: string; type: string };

export const TAX_RATES: Record<string, number> = {
  none: 0,
  sst_6: 0.06,
  sst_8: 0.08,
  sales_5: 0.05,
  sales_10: 0.1,
  exempt: 0,
};
