import "server-only";
import type { createSupabaseServerClient } from "@/shared/supabase/server";
import type { QuoteStatus } from "./copy";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
const sen = (v: unknown) => Math.round(Number(v ?? 0) * 100);
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export type QuoteListRow = { id: string; number: string; customer: string; date: string; expires: string | null; status: QuoteStatus; total: number };

/** Lejar's tabs: Drafts, Open (sent, accepted), Closed (declined, expired, void), Converted. */
export const TAB_STATUSES: Record<string, QuoteStatus[]> = {
  draft: ["draft"],
  open: ["sent", "accepted"],
  closed: ["declined", "expired", "void"],
  converted: ["converted"],
};

export async function listQuotes(supabase: Supabase, orgId: string): Promise<QuoteListRow[]> {
  await supabase.rpc("expire_due_quotes", { p_org: orgId });
  const { data } = await supabase
    .from("quotes")
    .select("id, quote_number, quote_date, expires_on, status, total, contacts(name)")
    .eq("org_id", orgId)
    .order("quote_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  return (data ?? []).map((q) => ({
    id: q.id,
    number: q.quote_number,
    customer: one(q.contacts as { name: string } | { name: string }[] | null)?.name ?? "",
    date: q.quote_date,
    expires: q.expires_on,
    status: q.status as QuoteStatus,
    total: sen(q.total),
  }));
}

export type QuoteDetail = {
  id: string;
  number: string;
  contactId: string;
  customer: string;
  date: string;
  expires: string | null;
  status: QuoteStatus;
  notes: string | null;
  subtotal: number;
  taxTotal: number;
  total: number;
  sentAt: string | null;
  respondedAt: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  lines: { no: number; description: string; accountCode: string; account: string; taxCode: string; amount: number; tax: number }[];
  events: { action: string; detail: string | null; at: string }[];
};

export async function loadQuote(supabase: Supabase, orgId: string, id: string): Promise<QuoteDetail | null> {
  await supabase.rpc("expire_due_quotes", { p_org: orgId });
  const { data: q } = await supabase
    .from("quotes")
    .select(
      "id, quote_number, contact_id, quote_date, expires_on, status, notes, subtotal, tax_total, total, sent_at, responded_at, invoice_id, contacts(name), invoices(invoice_number), quote_lines(line_no, description, amount, tax_code, tax_amount, accounts(code, name)), quote_events(action, detail, acted_at)",
    )
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (!q) return null;
  type L = { line_no: number; description: string; amount: unknown; tax_code: string; tax_amount: unknown; accounts: unknown };
  return {
    id: q.id,
    number: q.quote_number,
    contactId: q.contact_id,
    customer: one(q.contacts as { name: string } | { name: string }[] | null)?.name ?? "",
    date: q.quote_date,
    expires: q.expires_on,
    status: q.status as QuoteStatus,
    notes: q.notes,
    subtotal: sen(q.subtotal),
    taxTotal: sen(q.tax_total),
    total: sen(q.total),
    sentAt: q.sent_at,
    respondedAt: q.responded_at,
    invoiceId: q.invoice_id,
    invoiceNumber: one(q.invoices as { invoice_number: string } | { invoice_number: string }[] | null)?.invoice_number ?? null,
    lines: ((q.quote_lines ?? []) as L[])
      .sort((a, b) => a.line_no - b.line_no)
      .map((l) => {
        const a = one(l.accounts as { code: string; name: string } | { code: string; name: string }[] | null);
        return { no: l.line_no, description: l.description, accountCode: a?.code ?? "", account: a ? `${a.code} · ${a.name}` : "", taxCode: l.tax_code, amount: sen(l.amount), tax: sen(l.tax_amount) };
      }),
    events: ((q.quote_events ?? []) as { action: string; detail: string | null; acted_at: string }[])
      .sort((a, b) => a.acted_at.localeCompare(b.acted_at))
      .map((e) => ({ action: e.action, detail: e.detail, at: e.acted_at })),
  };
}
