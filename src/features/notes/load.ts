import "server-only";
import type { createSupabaseServerClient } from "@/shared/supabase/server";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
const sen = (v: unknown) => Math.round(Number(v ?? 0) * 100);
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export type NoteKind = "credit" | "debit" | "refund";
export type NoteStatus = "draft" | "recorded" | "void";
export type NoteRow = { id: string; kind: NoteKind; number: string; date: string; invoiceId: string; invoiceNumber: string; status: NoteStatus; total: number };

export async function listNotes(supabase: Supabase, orgId: string, invoiceId?: string): Promise<NoteRow[]> {
  let q = supabase
    .from("sales_notes")
    .select("id, kind, note_number, note_date, invoice_id, status, total, invoices(invoice_number)")
    .eq("org_id", orgId)
    .order("note_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (invoiceId) q = q.eq("invoice_id", invoiceId);
  const { data } = await q;
  return (data ?? []).map((n) => ({
    id: n.id,
    kind: n.kind as NoteKind,
    number: n.note_number,
    date: n.note_date,
    invoiceId: n.invoice_id,
    invoiceNumber: one(n.invoices as { invoice_number: string } | { invoice_number: string }[] | null)?.invoice_number ?? "",
    status: n.status as NoteStatus,
    total: sen(n.total),
  }));
}

export type NoteInvoice = {
  id: string;
  number: string;
  date: string;
  customer: string;
  status: string;
  /** lejar.ai's creditable balance: total + debit notes - credit and refund notes. */
  creditable: number;
  amountDue: number;
  refundable: number;
  firstAccount: string | null;
};

/** Recorded invoices a note can be issued against (for the picker), or one of them. */
export async function noteInvoices(supabase: Supabase, orgId: string, id?: string): Promise<NoteInvoice[]> {
  let q = supabase
    .from("invoices")
    .select("id, invoice_number, invoice_date, status, total, paid_amount, credit_applied, amount_due, notes_credit, notes_debit, notes_refund, contacts(name), invoice_lines(line_no, accounts(code))")
    .eq("org_id", orgId)
    .in("status", ["open", "paid"])
    .order("invoice_date", { ascending: false })
    .limit(500);
  if (id) q = q.eq("id", id);
  const { data } = await q;
  return (data ?? []).map((i) => {
    const lines = ((i.invoice_lines ?? []) as { line_no: number; accounts: { code: string } | { code: string }[] | null }[]).sort((a, b) => a.line_no - b.line_no);
    return {
      id: i.id,
      number: i.invoice_number,
      date: i.invoice_date,
      customer: one(i.contacts as { name: string } | { name: string }[] | null)?.name ?? "",
      status: i.status,
      creditable: sen(i.total) + sen(i.notes_debit) - sen(i.notes_credit) - sen(i.notes_refund),
      amountDue: sen(i.amount_due),
      refundable: sen(i.paid_amount) + sen(i.credit_applied) - sen(i.notes_refund),
      firstAccount: one(lines[0]?.accounts ?? null)?.code ?? null,
    };
  });
}

export type NoteDetail = {
  id: string;
  kind: NoteKind;
  number: string;
  date: string;
  reason: string;
  status: NoteStatus;
  total: number;
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  bank: string | null;
  journalEntryId: string | null;
  voidEntryId: string | null;
  voidedOn: string | null;
  voidReason: string | null;
  lines: { no: number; description: string; account: string; taxCode: string; amount: number; tax: number; quantity: number }[];
};

export async function loadNote(supabase: Supabase, orgId: string, id: string): Promise<NoteDetail | null> {
  const { data: n } = await supabase
    .from("sales_notes")
    .select(
      "id, kind, note_number, note_date, reason, status, total, invoice_id, journal_entry_id, void_entry_id, voided_on, void_reason, invoices(invoice_number, invoice_date), bank:accounts!sales_notes_bank_account_id_fkey(code, name), sales_note_lines(line_no, description, quantity, amount, tax_code, tax_amount, accounts(code, name))",
    )
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (!n) return null;
  const inv = one(n.invoices as { invoice_number: string; invoice_date: string } | { invoice_number: string; invoice_date: string }[] | null);
  const bank = one(n.bank as { code: string; name: string } | { code: string; name: string }[] | null);
  return {
    id: n.id,
    kind: n.kind as NoteKind,
    number: n.note_number,
    date: n.note_date,
    reason: n.reason,
    status: n.status as NoteStatus,
    total: sen(n.total),
    invoiceId: n.invoice_id,
    invoiceNumber: inv?.invoice_number ?? "",
    invoiceDate: inv?.invoice_date ?? "",
    bank: bank ? `${bank.code} · ${bank.name}` : null,
    journalEntryId: n.journal_entry_id,
    voidEntryId: n.void_entry_id,
    voidedOn: n.voided_on,
    voidReason: n.void_reason,
    lines: ((n.sales_note_lines ?? []) as { line_no: number; description: string; quantity: unknown; amount: unknown; tax_code: string; tax_amount: unknown; accounts: unknown }[])
      .sort((a, b) => a.line_no - b.line_no)
      .map((l) => {
        const a = one(l.accounts as { code: string; name: string } | { code: string; name: string }[] | null);
        return { no: l.line_no, description: l.description, account: a ? `${a.code} · ${a.name}` : "", taxCode: l.tax_code, amount: sen(l.amount), tax: sen(l.tax_amount), quantity: Number(l.quantity) };
      }),
  };
}
