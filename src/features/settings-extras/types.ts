export type ApiKeyScope = "read" | "write";

export type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  scope: ApiKeyScope;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type WebhookRow = {
  id: string;
  url: string;
  events: string[];
  signingSecretPrefix: string;
  enabled: boolean;
  createdAt: string;
};

export const WEBHOOK_EVENTS = [
  { id: "invoice.recorded", label: "Invoice recorded" },
  { id: "bill.recorded", label: "Bill recorded" },
  { id: "payment.recorded", label: "Receipt or payment recorded" },
  { id: "myinvois.validated", label: "MyInvois e-Invoice validated" },
  { id: "stocktake.confirmed", label: "Stocktake confirmed" },
] as const;
