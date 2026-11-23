import "server-only";
import type { createSupabaseServerClient } from "@/shared/supabase/server";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
const sen = (v: unknown) => Math.round(Number(v ?? 0) * 100);
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export type SnKind = "credit" | "debit";
export type SnStatus = "draft" | "recorded" | "void";
export type SnRow = { id: string; kind: SnKind; number: string; date: string; billId: string; billNumber: string; status: SnStatus; total: number };

export async function listSupplierNotes(supabase: Supabase, orgId: string, billId?: string): Promise<SnRow[]> {
  let q = supabase
    .from("supplier_notes")
    .select("id, kind, note_number, note_date, bill_id, status, total, bills(bill_number)")
    .eq("org_id", orgId)
    .order("note_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (billId) q = q.eq("bill_id", billId);
  const { data } = await q;
  return (data ?? []).map((n) => ({
    id: n.id,
    kind: n.kind as SnKind,
    number: n.note_number,
    date: n.note_date,
    billId: n.bill_id,
    billNumber: one(n.bills as { bill_number: string } | { bill_number: string }[] | null)?.bill_number ?? "",
    status: n.status as SnStatus,
    total: sen(n.total),
  }));
}

export type BillDetail = {
  id: string;
  number: string;
  supplier: string;
  date: string;
  dueDate: string | null;
  status: string;
  notes: string | null;
  total: number;
  paid: number;
  due: number;
  creditable: number;
  journalEntryId: string | null;
  voidedOn: string | null;
  voidReason: string | null;
  lines: { no: number; description: string; account: string; accountCode: string; taxCode: string; amount: number; tax: number; quantity: number; unit: number }[];
  payments: { id: string; date: string; reference: string | null; status: string; amount: number }[];
};

export async function loadBill(supabase: Supabase, orgId: string, id: string): Promise<BillDetail | null> {
  const { data: b } = await supabase
    .from("bills")
    .select(
      "id, bill_number, bill_date, due_date, status, notes, total, paid_amount, amount_due, notes_credit, notes_debit, journal_entry_id, voided_on, void_reason, contacts(name), bill_lines(line_no, description, quantity, unit_price, amount, tax_code, tax_amount, accounts(code, name)), payment_allocations(amount, payments(id, payment_date, reference, status))",
    )
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (!b) return null;
  type L = { line_no: number; description: string; quantity: unknown; unit_price: unknown; amount: unknown; tax_code: string; tax_amount: unknown; accounts: unknown };
  type A = { amount: unknown; payments: unknown };
  return {
    id: b.id,
    number: b.bill_number,
    supplier: one(b.contacts as { name: string } | { name: string }[] | null)?.name ?? "",
    date: b.bill_date,
    dueDate: b.due_date,
    status: b.status,
    notes: b.notes,
    total: sen(b.total),
    paid: sen(b.paid_amount),
    due: sen(b.amount_due),
    creditable: sen(b.total) + sen(b.notes_debit) - sen(b.notes_credit),
    journalEntryId: b.journal_entry_id,
    voidedOn: b.voided_on,
    voidReason: b.void_reason,
    lines: ((b.bill_lines ?? []) as L[])
      .sort((x, y) => x.line_no - y.line_no)
      .map((l) => {
        const a = one(l.accounts as { code: string; name: string } | { code: string; name: string }[] | null);
        return { no: l.line_no, description: l.description, account: a ? `${a.code} · ${a.name}` : "", accountCode: a?.code ?? "", taxCode: l.tax_code, amount: sen(l.amount), tax: sen(l.tax_amount), quantity: Number(l.quantity), unit: sen(l.unit_price) };
      }),
    payments: ((b.payment_allocations ?? []) as A[]).map((a) => {
      const p = one(a.payments as { id: string; payment_date: string; reference: string | null; status: string } | null);
      return { id: p?.id ?? "", date: p?.payment_date ?? "", reference: p?.reference ?? null, status: p?.status ?? "", amount: sen(a.amount) };
    }),
  };
}

export type SnDetail = {
  id: string;
  kind: SnKind;
  number: string;
  date: string;
  reason: string;
  status: SnStatus;
  total: number;
  billId: string;
  billNumber: string;
  journalEntryId: string | null;
  voidedOn: string | null;
  voidReason: string | null;
  lines: { no: number; description: string; account: string; taxCode: string; amount: number; tax: number }[];
};

export async function loadSupplierNote(supabase: Supabase, orgId: string, id: string): Promise<SnDetail | null> {
  const { data: n } = await supabase
    .from("supplier_notes")
    .select("id, kind, note_number, note_date, reason, status, total, bill_id, journal_entry_id, voided_on, void_reason, bills(bill_number), supplier_note_lines(line_no, description, amount, tax_code, tax_amount, accounts(code, name))")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (!n) return null;
  type L = { line_no: number; description: string; amount: unknown; tax_code: string; tax_amount: unknown; accounts: unknown };
  return {
    id: n.id,
    kind: n.kind as SnKind,
    number: n.note_number,
    date: n.note_date,
    reason: n.reason,
    status: n.status as SnStatus,
    total: sen(n.total),
    billId: n.bill_id,
    billNumber: one(n.bills as { bill_number: string } | { bill_number: string }[] | null)?.bill_number ?? "",
    journalEntryId: n.journal_entry_id,
    voidedOn: n.voided_on,
    voidReason: n.void_reason,
    lines: ((n.supplier_note_lines ?? []) as L[])
      .sort((a, b) => a.line_no - b.line_no)
      .map((l) => {
        const a = one(l.accounts as { code: string; name: string } | { code: string; name: string }[] | null);
        return { no: l.line_no, description: l.description, account: a ? `${a.code} · ${a.name}` : "", taxCode: l.tax_code, amount: sen(l.amount), tax: sen(l.tax_amount) };
      }),
  };
}
