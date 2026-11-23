import "server-only";
import type { createSupabaseServerClient } from "@/shared/supabase/server";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
const sen = (v: unknown) => Math.round(Number(v ?? 0) * 100);
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export type CreditMove = {
  id: string;
  kind: "receipt" | "note" | "apply";
  amount: number;
  date: string;
  status: "active" | "undone" | "void";
  undoneOn: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  noteId: string | null;
  noteNumber: string | null;
  reference: string | null;
};

/** A customer's credit: balance (active moves) and history, newest first. */
export async function customerCredit(supabase: Supabase, orgId: string, contactId: string) {
  const { data } = await supabase
    .from("customer_credit_moves")
    .select("id, kind, amount, on_date, status, undone_on, invoice_id, note_id, invoices(invoice_number), sales_notes(note_number), receipts(reference)")
    .eq("org_id", orgId)
    .eq("contact_id", contactId)
    .order("on_date", { ascending: false })
    .order("created_at", { ascending: false });
  const moves: CreditMove[] = (data ?? []).map((m) => ({
    id: m.id,
    kind: m.kind as CreditMove["kind"],
    amount: sen(m.amount),
    date: m.on_date,
    status: m.status as CreditMove["status"],
    undoneOn: m.undone_on,
    invoiceId: m.invoice_id,
    invoiceNumber: one(m.invoices as { invoice_number: string } | { invoice_number: string }[] | null)?.invoice_number ?? null,
    noteId: m.note_id,
    noteNumber: one(m.sales_notes as { note_number: string } | { note_number: string }[] | null)?.note_number ?? null,
    reference: one(m.receipts as { reference: string | null } | { reference: string | null }[] | null)?.reference ?? null,
  }));
  const balance = moves.filter((m) => m.status === "active").reduce((s, m) => s + m.amount, 0);
  return { balance, moves };
}

/** Credit applied to one invoice (for its detail page). */
export async function invoiceCreditApplications(supabase: Supabase, orgId: string, invoiceId: string) {
  const { data } = await supabase
    .from("customer_credit_moves")
    .select("id, amount, on_date, status, undone_on")
    .eq("org_id", orgId)
    .eq("invoice_id", invoiceId)
    .eq("kind", "apply")
    .order("on_date");
  return (data ?? []).map((m) => ({ id: m.id, amount: -sen(m.amount), date: m.on_date, status: m.status as "active" | "undone", undoneOn: m.undone_on as string | null }));
}
