import "server-only";
import { todayMY } from "@/features/books/load";
import type { createSupabaseServerClient } from "@/shared/supabase/server";
import type {
  CustomerChoice,
  DiscountMode,
  QuickInvoiceFormInput,
  QuickInvoiceProfileSnapshot,
  QuickInvoiceStatus,
  QuickInvoiceSummary,
  QuickTaxCode,
  RevenueAccountChoice,
} from "./types";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
const sen = (v: unknown) => Math.round(Number(v ?? 0) * 100);
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export async function loadQuickInvoicesList(supabase: Supabase, orgId: string) {
  const { data } = await supabase
    .from("quick_invoices")
    .select("id, invoice_number, customer_name, customer_email, invoice_date, due_date, status, total, linked_invoice_id, invoices(invoice_number)")
    .eq("org_id", orgId)
    .order("invoice_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  const items: QuickInvoiceSummary[] = (data ?? []).map((r) => {
    const inv = one(r.invoices as { invoice_number: string } | { invoice_number: string }[] | null);
    return {
      id: r.id,
      invoiceNumber: r.invoice_number,
      customerName: r.customer_name,
      customerEmail: r.customer_email ?? null,
      invoiceDate: r.invoice_date,
      dueDate: r.due_date ?? null,
      status: r.status as QuickInvoiceStatus,
      totalSen: sen(r.total),
      linkedInvoiceId: r.linked_invoice_id ?? null,
      linkedInvoiceNumber: inv?.invoice_number ?? null,
    };
  });

  return {
    items,
    draftCount: items.filter((i) => i.status === "draft").length,
    sentCount: items.filter((i) => i.status === "sent").length,
  };
}

export async function loadQuickInvoiceFormDeps(supabase: Supabase, orgId: string) {
  const [{ data: org }, { data: contacts }, { data: accts }] = await Promise.all([
    supabase
      .from("organizations")
      .select(
        "legal_name, registration_number, address, postcode, city, state, payment_note, logo_path, payment_qr_path, default_pricing_mode, default_income_account_code",
      )
      .eq("id", orgId)
      .single(),
    supabase
      .from("contacts")
      .select("id, name, email")
      .eq("org_id", orgId)
      .in("kind", ["customer", "both"])
      .order("name"),
    supabase
      .from("accounts")
      .select("code, name")
      .eq("org_id", orgId)
      .eq("type", "revenue")
      .eq("status", "active")
      .order("code"),
  ]);

  const addrParts = [org?.address, [org?.postcode, org?.city].filter(Boolean).join(" "), org?.state].filter(Boolean);
  const profile: QuickInvoiceProfileSnapshot = {
    legalName: org?.legal_name ?? "",
    ssmNumber: org?.registration_number ?? null,
    address: addrParts.length > 0 ? addrParts.join(", ") : null,
    paymentNote: org?.payment_note ?? null,
    hasLogo: Boolean(org?.logo_path),
    hasPaymentQr: Boolean(org?.payment_qr_path),
    defaultPricingMode: org?.default_pricing_mode === "inclusive" ? "inclusive" : "exclusive",
    defaultIncomeAccountCode: org?.default_income_account_code ?? "600-0100",
  };

  const customers: CustomerChoice[] = (contacts ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email ?? null,
  }));

  const revenueAccounts: RevenueAccountChoice[] = (accts ?? []).map((a) => ({
    code: a.code,
    name: a.name,
  }));

  return { profile, customers, revenueAccounts, today: todayMY() };
}

export async function loadQuickInvoiceDetail(supabase: Supabase, orgId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data: qi } = await supabase
    .from("quick_invoices")
    .select(
      "id, contact_id, customer_name, customer_email, invoice_number, invoice_date, due_date, pricing_mode, income_account_code, status, notes, subtotal, tax_total, total, linked_invoice_id, sent_at, invoices(invoice_number), quick_invoice_lines(line_no, description, quantity, unit_price, discount_mode, discount_percent, discounted_unit_price, amount, net, tax_code, tax_amount)",
    )
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (!qi) return null;

  const inv = one(qi.invoices as { invoice_number: string } | { invoice_number: string }[] | null);
  type L = {
    line_no: number;
    description: string;
    quantity: unknown;
    unit_price: unknown;
    discount_mode: string | null;
    discount_percent: unknown;
    discounted_unit_price: unknown;
    amount: unknown;
    net: unknown;
    tax_code: string;
    tax_amount: unknown;
  };
  const lines = ((qi.quick_invoice_lines ?? []) as L[]).sort((a, b) => a.line_no - b.line_no);

  const formInitial: QuickInvoiceFormInput = {
    id: qi.id,
    customerContactId: qi.contact_id ?? null,
    customerName: qi.customer_name,
    customerEmail: qi.customer_email ?? "",
    saveCustomer: false,
    invoiceNumber: qi.invoice_number,
    invoiceDate: qi.invoice_date,
    dueDate: qi.due_date ?? "",
    pricingMode: qi.pricing_mode === "inclusive" ? "inclusive" : "exclusive",
    incomeAccountCode: qi.income_account_code,
    notes: qi.notes ?? "",
    lines: lines.map((l) => {
      const dm = (l.discount_mode ?? "") as DiscountMode;
      const up = Number(l.unit_price);
      const eff = Number(l.discounted_unit_price);
      return {
        description: l.description,
        quantity: String(Number(l.quantity)),
        unitPrice: String(up),
        discountMode: dm,
        discountPercent: l.discount_percent != null ? String(Number(l.discount_percent)) : "",
        discountAmount: dm === "amount" ? String(Math.round((up - eff) * 100) / 100) : "",
        discountedUnitPrice: dm === "price" ? String(eff) : "",
        taxCode: l.tax_code as QuickTaxCode,
      };
    }),
  };

  return {
    id: qi.id,
    contactId: qi.contact_id ?? null,
    customerName: qi.customer_name,
    customerEmail: qi.customer_email ?? null,
    invoiceNumber: qi.invoice_number,
    invoiceDate: qi.invoice_date,
    dueDate: qi.due_date ?? null,
    pricingMode: qi.pricing_mode === "inclusive" ? ("inclusive" as const) : ("exclusive" as const),
    incomeAccountCode: qi.income_account_code,
    status: qi.status as QuickInvoiceStatus,
    notes: qi.notes ?? null,
    subtotalSen: sen(qi.subtotal),
    taxTotalSen: sen(qi.tax_total),
    totalSen: sen(qi.total),
    linkedInvoiceId: qi.linked_invoice_id ?? null,
    linkedInvoiceNumber: inv?.invoice_number ?? null,
    sentAt: qi.sent_at ?? null,
    lines: lines.map((l) => ({
      lineNo: l.line_no,
      description: l.description,
      quantity: Number(l.quantity),
      unitPriceSen: sen(l.unit_price),
      discountedUnitPriceSen: sen(l.discounted_unit_price),
      discountMode: l.discount_mode,
      discountPercent: l.discount_percent != null ? Number(l.discount_percent) : null,
      amountSen: sen(l.amount),
      netSen: sen(l.net),
      taxCode: l.tax_code as QuickTaxCode,
      taxAmountSen: sen(l.tax_amount),
    })),
    formInitial,
  };
}
