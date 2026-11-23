import "server-only";
import type { createSupabaseServerClient } from "@/shared/supabase/server";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type InvoiceLineRow = {
  line_no: number;
  description: string;
  quantity: string;
  unit_price: string;
  discount_mode: string | null;
  discount_percent: string | null;
  discounted_unit_price: string;
  amount: string;
  net: string;
  tax_code: string;
  tax_amount: string;
  classification_code: string | null;
  accounts: { code: string; name: string } | null;
};

export type InvoiceRow = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  pricing_mode: "exclusive" | "inclusive";
  status: "draft" | "open" | "paid" | "void";
  notes: string | null;
  subtotal: string;
  tax_total: string;
  total: string;
  journal_entry_id: string | null;
  void_entry_id: string | null;
  voided_on: string | null;
  void_reason: string | null;
  created_at: string;
  updated_at: string;
  contacts: {
    id: string;
    name: string;
    tin: string | null;
    registration_number: string | null;
    sst_number: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    postcode: string | null;
    city: string | null;
    state: string | null;
  };
  invoice_lines: InvoiceLineRow[];
};

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** One invoice of the entity with its customer and lines (RLS limits it to members). */
export async function loadInvoice(supabase: Supabase, orgId: string, id: string): Promise<InvoiceRow | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, invoice_date, due_date, pricing_mode, status, notes, subtotal, tax_total, total, journal_entry_id, void_entry_id, voided_on, void_reason, created_at, updated_at, contacts(id, name, tin, registration_number, sst_number, email, phone, address, postcode, city, state), invoice_lines(line_no, description, quantity, unit_price, discount_mode, discount_percent, discounted_unit_price, amount, net, tax_code, tax_amount, classification_code, accounts(code, name))",
    )
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as InvoiceRow & { contacts: InvoiceRow["contacts"] | InvoiceRow["contacts"][] };
  return {
    ...row,
    contacts: one(row.contacts)!,
    invoice_lines: [...row.invoice_lines]
      .sort((a, b) => a.line_no - b.line_no)
      .map((l) => ({ ...l, accounts: one(l.accounts as unknown as { code: string; name: string } | { code: string; name: string }[] | null) })),
  };
}
