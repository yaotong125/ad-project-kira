import type { DiscountMode } from "./math";

/** One invoice line as the form edits it (shared by the server pages and the client form). */
export type FormLine = {
  description: string;
  accountCode: string;
  quantity: string;
  unitPrice: string;
  discountMode: DiscountMode;
  discountPercent: string;
  discountAmount: string;
  discountedUnitPrice: string;
  taxCode: string;
  classificationCode: string;
};

export const blankLine = (accountCode: string): FormLine => ({
  description: "", accountCode, quantity: "1", unitPrice: "", discountMode: "", discountPercent: "", discountAmount: "",
  discountedUnitPrice: "", taxCode: "none", classificationCode: "",
});
