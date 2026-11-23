export type QuickInvoiceStatus = "draft" | "sent";
export type QuickTaxCode = "none" | "sst_6" | "sst_8" | "sales_5" | "sales_10" | "exempt";
export type DiscountMode = "" | "percent" | "amount" | "price";

export const QUICK_TAX_OPTIONS: { code: QuickTaxCode; label: string; rate: number }[] = [
  { code: "none", label: "No SST", rate: 0 },
  { code: "sst_8", label: "Service tax 8%", rate: 8 },
  { code: "sst_6", label: "Service tax 6%", rate: 6 },
  { code: "sales_5", label: "Sales tax 5%", rate: 5 },
  { code: "sales_10", label: "Sales tax 10%", rate: 10 },
  { code: "exempt", label: "Exempt", rate: 0 },
];

export type QuickInvoiceLineInput = {
  description: string;
  quantity: string;
  unitPrice: string;
  discountMode: DiscountMode;
  discountPercent: string;
  discountAmount: string;
  discountedUnitPrice: string;
  taxCode: QuickTaxCode;
};

export type QuickInvoiceFormInput = {
  id: string | null;
  customerContactId: string | null;
  customerName: string;
  customerEmail: string;
  saveCustomer: boolean;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  pricingMode: "exclusive" | "inclusive";
  incomeAccountCode: string;
  notes: string;
  lines: QuickInvoiceLineInput[];
};

export type QuickInvoiceSummary = {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerEmail: string | null;
  invoiceDate: string;
  dueDate: string | null;
  status: QuickInvoiceStatus;
  totalSen: number;
  linkedInvoiceId: string | null;
  linkedInvoiceNumber: string | null;
};

export type QuickInvoiceProfileSnapshot = {
  legalName: string;
  ssmNumber: string | null;
  address: string | null;
  paymentNote: string | null;
  hasLogo: boolean;
  hasPaymentQr: boolean;
  defaultPricingMode: "exclusive" | "inclusive";
  defaultIncomeAccountCode: string;
};

export type CustomerChoice = {
  id: string;
  name: string;
  email: string | null;
};

export type RevenueAccountChoice = {
  code: string;
  name: string;
};

export function computeQuickLine(
  line: QuickInvoiceLineInput,
  pricingMode: "exclusive" | "inclusive",
): { netSen: number; taxSen: number; totalSen: number } {
  const qty = Number(line.quantity) || 0;
  const price = Number(line.unitPrice) || 0;
  if (qty <= 0 || price < 0) return { netSen: 0, taxSen: 0, totalSen: 0 };

  let eff = price;
  if (line.discountMode === "percent") {
    const pct = Math.min(100, Math.max(0, Number(line.discountPercent) || 0));
    eff = Math.round(price * (1 - pct / 100) * 100) / 100;
  } else if (line.discountMode === "amount") {
    const amt = Math.min(price, Math.max(0, Number(line.discountAmount) || 0));
    eff = Math.round((price - amt) * 100) / 100;
  } else if (line.discountMode === "price") {
    const dp = Math.min(price, Math.max(0, Number(line.discountedUnitPrice) || 0));
    eff = Math.round(dp * 100) / 100;
  }

  const amtSen = Math.round(qty * eff * 100);
  const rate = QUICK_TAX_OPTIONS.find((t) => t.code === line.taxCode)?.rate ?? 0;
  if (rate === 0) return { netSen: amtSen, taxSen: 0, totalSen: amtSen };
  if (pricingMode === "inclusive") {
    const taxSen = Math.round((amtSen * rate) / (100 + rate));
    return { netSen: amtSen - taxSen, taxSen, totalSen: amtSen };
  }
  const taxSen = Math.round((amtSen * rate) / 100);
  return { netSen: amtSen, taxSen, totalSen: amtSen + taxSen };
}
