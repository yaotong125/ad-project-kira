import "server-only";
import type { createSupabaseServerClient } from "@/shared/supabase/server";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type Row = Record<string, unknown>;
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const name = (c: unknown) => one(c as { name: string } | { name: string }[] | null)?.name ?? null;

export type DocInfo = { party: string | null; docs: string | null };

/**
 * Who and what a journal entry is about, from its source document: the customer or supplier and the
 * invoice / bill number(s). Keyed by journal_entries.source_id (an invoice, bill, receipt or payment id).
 */
export async function documentInfo(supabase: Supabase, sourceIds: (string | null | undefined)[]): Promise<Map<string, DocInfo>> {
  const info = new Map<string, DocInfo>();
  const ids = [...new Set(sourceIds.filter(Boolean) as string[])];
  if (ids.length === 0) return info;
  const [inv, bil, rec, pay, notes, snotes, vouchers, transfers, assets, prepaids] = await Promise.all([
    supabase.from("invoices").select("id, invoice_number, contacts(name)").in("id", ids),
    supabase.from("bills").select("id, bill_number, contacts(name)").in("id", ids),
    supabase.from("receipts").select("id, receipt_allocations(invoices(invoice_number, contacts(name)))").in("id", ids),
    supabase.from("payments").select("id, payment_allocations(bills(bill_number, contacts(name)))").in("id", ids),
    supabase.from("sales_notes").select("id, note_number, invoices(invoice_number, contacts(name))").in("id", ids),
    supabase.from("supplier_notes").select("id, note_number, bills(bill_number, contacts(name))").in("id", ids),
    supabase.from("cash_vouchers").select("id, voucher_number, party_name").in("id", ids),
    supabase.from("bank_transfers").select("id, transfer_number, reference").in("id", ids),
    supabase.from("fixed_assets").select("id, asset_code, name").in("id", ids),
    supabase.from("prepaid_schedules").select("id, name").in("id", ids),
  ]);
  for (const i of inv.data ?? []) info.set(i.id, { party: name(i.contacts), docs: i.invoice_number });
  for (const b of bil.data ?? []) info.set(b.id, { party: name(b.contacts), docs: b.bill_number });
  for (const v of vouchers.data ?? []) info.set(v.id, { party: v.party_name ?? null, docs: v.voucher_number });
  for (const t of transfers.data ?? []) info.set(t.id, { party: t.reference ?? null, docs: t.transfer_number });
  for (const a of assets.data ?? []) info.set(a.id, { party: a.name, docs: a.asset_code });
  for (const p of prepaids.data ?? []) info.set(p.id, { party: p.name, docs: null });
  const fromAllocs = (id: string, allocs: unknown, key: "invoices" | "bills", numKey: string) => {
    const docs = ((allocs ?? []) as Row[]).map((a) => one(a[key] as Row | Row[] | null)).filter(Boolean) as Row[];
    const parties = [...new Set(docs.map((d) => name(d.contacts)).filter(Boolean))] as string[];
    info.set(id, { party: parties.length > 0 ? parties.join(", ") : null, docs: docs.map((d) => d[numKey] as string).join(", ") || null });
  };
  for (const n of notes.data ?? []) {
    const inv = one(n.invoices as Row | Row[] | null);
    info.set(n.id, { party: inv ? name(inv.contacts) : null, docs: inv ? `${n.note_number} (${inv.invoice_number as string})` : n.note_number });
  }
  for (const n of snotes.data ?? []) {
    const b = one(n.bills as Row | Row[] | null);
    info.set(n.id, { party: b ? name(b.contacts) : null, docs: b ? `${n.note_number} (${b.bill_number as string})` : n.note_number });
  }
  for (const r of rec.data ?? []) fromAllocs(r.id, r.receipt_allocations, "invoices", "invoice_number");
  for (const p of pay.data ?? []) fromAllocs(p.id, p.payment_allocations, "bills", "bill_number");
  return info;
}
