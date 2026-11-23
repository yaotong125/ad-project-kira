export type MyInvoisStatus = "not_submitted" | "pending" | "valid" | "rejected" | "cancelled";
export type MyInvoisEnv = "sandbox" | "production";

export type ChecklistItem = {
  key: string;
  label: string;
  value: string | null;
  ok: boolean;
};

export type SupplierSetup = {
  enabled: boolean;
  environment: MyInvoisEnv;
  verifiedAt: string | null;
  mandateStart: string | null;
  checklist: ChecklistItem[];
  profileComplete: boolean;
  apiMode: "live_org" | "live_env" | "simulation";
  clientId: string | null;
  clientSecretHint: string | null;
  onBehalfOf: string | null;
  encryptionReady: boolean;
};

export type SubmissionSnapshot = {
  id: string;
  status: Exclude<MyInvoisStatus, "not_submitted">;
  environment: MyInvoisEnv;
  lhdnUuid: string | null;
  longId: string | null;
  submissionUid: string | null;
  rejectionReason: string | null;
  cancelReason: string | null;
  submittedAt: string;
  validatedAt: string | null;
  cancelledAt: string | null;
  payload: Record<string, unknown>;
};

export type MyInvoisInvoiceRow = {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceStatus: string;
  totalSen: number;
  contactId: string;
  customerName: string;
  buyerIssues: string[];
  status: MyInvoisStatus;
  latest: SubmissionSnapshot | null;
};

export const MYINVOIS_CHIP: Record<MyInvoisStatus, [string, string]> = {
  not_submitted: ["chip", "Not submitted"],
  pending: ["chip warn", "Submitted, awaiting LHDN"],
  valid: ["chip pos", "Valid"],
  rejected: ["chip neg", "Rejected"],
  cancelled: ["chip", "Cancelled"],
};
