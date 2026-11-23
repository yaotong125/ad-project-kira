import "server-only";
import type { createSupabaseServerClient } from "@/shared/supabase/server";
import type { DoStatus } from "./copy";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
const sen = (v: unknown) => Math.round(Number(v ?? 0) * 100);
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export type DoListRow = { id: string; number: string; customer: string; date: string; status: DoStatus; total: number };

export async function listDeliveryOrders(supabase: Supabase, orgId: string): Promise<DoListRow[]> {
  const { data } = await supabase
    .from("delivery_orders")
    .select("id, do_number, do_date, status, total, contacts(name)")
    .eq("org_id", orgId)
    .order("do_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  return (data ?? []).map((d) => ({
    id: d.id,
    number: d.do_number,
    customer: one(d.contacts as { name: string } | { name: string }[] | null)?.name ?? "",
    date: d.do_date,
    status: d.status as DoStatus,
    total: sen(d.total),
  }));
}

export type DoDetail = {
  id: string;
  number: string;
  customer: string;
  date: string;
  status: DoStatus;
  notes: string | null;
  subtotal: number;
  taxTotal: number;
  total: number;
  invoiceId: string | null;
  invoiceNumber: string | null;
  invoiceVoid: boolean;
  lines: { no: number; description: string; quantity: number; unit: number; accountCode: string; taxCode: string; amount: number; tax: number }[];
};

export async function loadDeliveryOrder(supabase: Supabase, orgId: string, id: string): Promise<DoDetail | null> {
  const { data: d } = await supabase
    .from("delivery_orders")
    .select(
      "id, do_number, do_date, status, notes, subtotal, tax_total, total, invoice_id, contacts(name), invoices(invoice_number, status), delivery_order_lines(line_no, description, quantity, unit_amount, amount, tax_code, tax_amount, accounts(code))",
    )
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (!d) return null;
  const inv = one(d.invoices as { invoice_number: string; status: string } | { invoice_number: string; status: string }[] | null);
  type L = { line_no: number; description: string; quantity: unknown; unit_amount: unknown; amount: unknown; tax_code: string; tax_amount: unknown; accounts: unknown };
  return {
    id: d.id,
    number: d.do_number,
    customer: one(d.contacts as { name: string } | { name: string }[] | null)?.name ?? "",
    date: d.do_date,
    status: d.status as DoStatus,
    notes: d.notes,
    subtotal: sen(d.subtotal),
    taxTotal: sen(d.tax_total),
    total: sen(d.total),
    invoiceId: d.invoice_id,
    invoiceNumber: inv?.invoice_number ?? null,
    invoiceVoid: d.status === "converted" && (!d.invoice_id || inv?.status === "void"),
    lines: ((d.delivery_order_lines ?? []) as L[])
      .sort((a, b) => a.line_no - b.line_no)
      .map((l) => ({
        no: l.line_no,
        description: l.description,
        quantity: Number(l.quantity),
        unit: sen(l.unit_amount),
        accountCode: one(l.accounts as { code: string } | { code: string }[] | null)?.code ?? "",
        taxCode: l.tax_code,
        amount: sen(l.amount),
        tax: sen(l.tax_amount),
      })),
  };
}
