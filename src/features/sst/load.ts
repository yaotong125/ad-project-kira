import "server-only";
import { todayMY } from "@/features/books/load";
import type { createSupabaseServerClient } from "@/shared/supabase/server";
import { bookkeepingPeriods, cadencePeriods, type SstCadence, type SstPeriod } from "./periods";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
const sen = (v: unknown) => Math.round(Number(v ?? 0) * 100);

export type TaxKind = "service" | "sales";
export type RateRow = { kind: TaxKind; rate: number; value: number; tax: number };
export type DocRow = {
  date: string;
  kind: "invoice" | "receipt" | "deemed" | "invoice_void" | "receipt_void" | "deemed_void" | "note" | "note_void" | "credit" | "credit_undo";
  invoiceId: string;
  /** For notes: the note's id, kind and number (the row links to the note). */
  note?: { id: string; kind: "credit" | "debit" | "refund"; number: string };
  number: string;
  taxKind: TaxKind;
  rate: number;
  value: number;
  tax: number;
};
export type SstReturn = {
  byRate: RateRow[];
  docs: DocRow[];
  total: number;
  ledger: { account: number; gap: number; waiting: number; waitingTax: number };
};

const RATE: Record<string, { kind: TaxKind; rate: number }> = {
  sst_6: { kind: "service", rate: 6 },
  sst_8: { kind: "service", rate: 8 },
  sales_5: { kind: "sales", rate: 5 },
  sales_10: { kind: "sales", rate: 10 },
};

type Line = { net: unknown; tax_code: string; tax_amount: unknown };
type Inv = { id: string; invoice_number: string; invoice_date: string; status: string; voided_on: string | null; invoice_lines: Line[] };

/** The invoice's taxed lines summed per tax code: value (net) and tax, in sen. */
function byCode(lines: Line[], kind: TaxKind) {
  const m = new Map<string, { rate: number; value: number; tax: number }>();
  for (const l of lines) {
    const r = RATE[l.tax_code];
    if (!r || r.kind !== kind || sen(l.tax_amount) === 0) continue;
    const cur = m.get(l.tax_code) ?? { rate: r.rate, value: 0, tax: 0 };
    cur.value += sen(l.net);
    cur.tax += sen(l.tax_amount);
    m.set(l.tax_code, cur);
  }
  return [...m.values()];
}

/**
 * Splits `amount` sen of an invoice's service tax across its service tax rates in proportion to each rate's
 * tax (the remainder goes to the largest), with the matching share of taxable value. lejar.ai: "Service tax
 * on a payment is the payment's share of the invoice's service tax."
 */
export function splitService(lines: Line[], amount: number) {
  const parts = byCode(lines, "service").sort((a, b) => b.tax - a.tax);
  const total = parts.reduce((s, p) => s + p.tax, 0);
  if (!total || !amount) return [];
  const out = parts.map((p) => ({ rate: p.rate, tax: Math.trunc((amount * p.tax) / total), value: 0 }));
  out[0].tax += amount - out.reduce((s, p) => s + p.tax, 0);
  for (let i = 0; i < out.length; i++) out[i].value = Math.round((parts[i].value * out[i].tax) / parts[i].tax);
  return out.filter((p) => p.tax !== 0);
}

const addMonthsPlusDay = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  const target = new Date(Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate()));
  if (target.getUTCDate() !== d.getUTCDate()) target.setUTCDate(0); // 29 Feb → 28 Feb
  target.setUTCDate(target.getUTCDate() + 1);
  return target.toISOString().slice(0, 10);
};
/** The day an unpaid invoice's service tax is deemed paid: the day after 12 months from the invoice date. */
export const deemedDate = addMonthsPlusDay;

/** The SST-02 periods for the entity, newest first, plus what the page header needs. */
export async function loadSstPeriods(supabase: Supabase, orgId: string, lang: "en" | "ms" = "en") {
  const [{ data: org }, { data: years }, { data: books }] = await Promise.all([
    supabase.from("organizations").select("legal_name, sst_number, fiscal_year_end, sst_cadence, sst_registered_on, sst_locked_until").eq("id", orgId).single(),
    supabase.from("fiscal_years").select("starts_on, ends_on").eq("org_id", orgId).order("starts_on"),
    supabase.from("accounting_periods").select("starts_on, ends_on").eq("org_id", orgId).order("starts_on"),
  ]);
  const cadence = (org?.sst_cadence as SstCadence | null) ?? null;
  const rangeStart = years?.[0]?.starts_on;
  const rangeEnd = years?.at(-1)?.ends_on;
  const periods: SstPeriod[] =
    cadence && rangeStart && rangeEnd && org
      ? cadencePeriods({ fyeMonth: Number(org.fiscal_year_end.slice(5, 7)), cadence, rangeStart, rangeEnd, registeredOn: org.sst_registered_on, lang })
      : bookkeepingPeriods((books ?? []).map((p) => ({ startsOn: p.starts_on, endsOn: p.ends_on })), org?.sst_registered_on);
  return {
    periods,
    legalName: org?.legal_name ?? "",
    sstNumber: org?.sst_number ?? "",
    cadence,
    registeredOn: org?.sst_registered_on ?? null,
    lockedUntil: org?.sst_locked_until ?? null,
    fiscalYearEnd: org?.fiscal_year_end ?? "",
  };
}

const INV_COLS = "id, invoice_number, invoice_date, status, voided_on, invoice_lines(net, tax_code, tax_amount)";

/**
 * The SST-02 return for [from, to] (lejar.ai's help article "SST returns (SST-02)"):
 * - sales tax counts in the period of the invoice date;
 * - service tax counts when the customer pays, in proportion to each payment, or on the day after 12 months
 *   from the invoice date if still unpaid (a deemed payment);
 * - a voided invoice or payment shows as a negative line on its void date;
 * - no input tax is deducted, and a payment to Customs does not change the return.
 * Kira has no credit / debit notes or customer deposits yet, so those lines never appear.
 */
export async function loadSstReturn(supabase: Supabase, orgId: string, from: string, to: string): Promise<SstReturn> {
  const inRange = (col: string) => `and(${col}.gte.${from},${col}.lte.${to})`;
  const [salesInv, receipts, deemed, outputAcct, waiting, notes, applied] = await Promise.all([
    supabase.from("invoices").select(INV_COLS).eq("org_id", orgId).neq("status", "draft").or(`${inRange("invoice_date")},${inRange("voided_on")}`),
    supabase
      .from("receipts")
      .select("id, receipt_date, status, voided_on, receipt_allocations(invoice_id, sst_moved)")
      .eq("org_id", orgId)
      .or(`${inRange("receipt_date")},${inRange("voided_on")}`),
    supabase.from("sst_deemed_moves").select("invoice_id, counts_on, reversed_on, amount").eq("org_id", orgId).or(`${inRange("counts_on")},${inRange("reversed_on")}`),
    supabase.from("accounts").select("id").eq("org_id", orgId).eq("code", "400-1300").maybeSingle(),
    supabase.from("invoices").select("id, invoice_date, sst_released, service_adjust, invoice_lines(net, tax_code, tax_amount)").eq("org_id", orgId).eq("status", "open"),
    supabase
      .from("sales_notes")
      .select("id, kind, note_number, note_date, status, voided_on, void_entry_id, journal_entry_id, sst_from_output, invoice_id, invoices(invoice_number), sales_note_lines(amount, tax_code, tax_amount)")
      .eq("org_id", orgId)
      .not("journal_entry_id", "is", null)
      .or(`${inRange("note_date")},${inRange("voided_on")}`),
    supabase
      .from("customer_credit_moves")
      .select("invoice_id, on_date, status, undone_on, sst_moved")
      .eq("org_id", orgId)
      .eq("kind", "apply")
      .gt("sst_moved", 0)
      .or(`${inRange("on_date")},${inRange("undone_on")}`),
  ]);

  // Invoices that payments and deemed moves refer to.
  const need = new Set<string>();
  for (const r of receipts.data ?? []) for (const a of r.receipt_allocations ?? []) if (sen(a.sst_moved)) need.add(a.invoice_id);
  for (const d of deemed.data ?? []) need.add(d.invoice_id);
  for (const c of applied.data ?? []) need.add(c.invoice_id);
  const invoices = new Map<string, Inv>((salesInv.data ?? []).map((i) => [i.id, i as Inv]));
  const missing = [...need].filter((id) => !invoices.has(id));
  if (missing.length) {
    const { data } = await supabase.from("invoices").select(INV_COLS).in("id", missing);
    for (const i of data ?? []) invoices.set(i.id, i as Inv);
  }

  const docs: DocRow[] = [];
  const within = (d: string | null | undefined) => !!d && d >= from && d <= to;

  // Sales tax on the invoice date; taken back on the void date.
  for (const inv of salesInv.data ?? []) {
    const parts = byCode((inv as Inv).invoice_lines, "sales");
    for (const p of parts) {
      if (within(inv.invoice_date)) docs.push({ date: inv.invoice_date, kind: "invoice", invoiceId: inv.id, number: inv.invoice_number, taxKind: "sales", rate: p.rate, value: p.value, tax: p.tax });
      if (inv.status === "void" && within(inv.voided_on)) docs.push({ date: inv.voided_on!, kind: "invoice_void", invoiceId: inv.id, number: inv.invoice_number, taxKind: "sales", rate: p.rate, value: -p.value, tax: -p.tax });
    }
  }

  // Service tax on each payment's share; taken back when the payment is voided.
  for (const r of receipts.data ?? []) {
    for (const a of r.receipt_allocations ?? []) {
      const inv = invoices.get(a.invoice_id);
      if (!inv) continue;
      for (const p of splitService(inv.invoice_lines, sen(a.sst_moved))) {
        if (within(r.receipt_date)) docs.push({ date: r.receipt_date, kind: "receipt", invoiceId: inv.id, number: inv.invoice_number, taxKind: "service", rate: p.rate, value: p.value, tax: p.tax });
        if (r.status === "void" && within(r.voided_on)) docs.push({ date: r.voided_on!, kind: "receipt_void", invoiceId: inv.id, number: inv.invoice_number, taxKind: "service", rate: p.rate, value: -p.value, tax: -p.tax });
      }
    }
  }

  // Customer credit applied to an invoice releases its service tax share like a payment; an undo takes it back.
  for (const c of applied.data ?? []) {
    const inv = invoices.get(c.invoice_id);
    if (!inv) continue;
    for (const p of splitService(inv.invoice_lines, sen(c.sst_moved))) {
      if (within(c.on_date)) docs.push({ date: c.on_date, kind: "credit", invoiceId: inv.id, number: inv.invoice_number, taxKind: "service", rate: p.rate, value: p.value, tax: p.tax });
      if (c.status === "undone" && within(c.undone_on)) docs.push({ date: c.undone_on!, kind: "credit_undo", invoiceId: inv.id, number: inv.invoice_number, taxKind: "service", rate: p.rate, value: -p.value, tax: -p.tax });
    }
  }

  // Deemed payments; a void of the invoice takes them back on its date.
  for (const d of deemed.data ?? []) {
    const inv = invoices.get(d.invoice_id);
    if (!inv) continue;
    for (const p of splitService(inv.invoice_lines, sen(d.amount))) {
      if (within(d.counts_on)) docs.push({ date: d.counts_on, kind: "deemed", invoiceId: inv.id, number: inv.invoice_number, taxKind: "service", rate: p.rate, value: p.value, tax: p.tax });
      if (within(d.reversed_on)) docs.push({ date: d.reversed_on!, kind: "deemed_void", invoiceId: inv.id, number: inv.invoice_number, taxKind: "service", rate: p.rate, value: -p.value, tax: -p.tax });
    }
  }

  // Credit / refund notes take tax back on the note date (sales tax, and service tax already in SST output);
  // debit notes add sales tax (their service tax is deferred until paid). A voided note reverses on its void date.
  for (const n of notes.data ?? []) {
    const sign = n.kind === "debit" ? 1 : -1;
    const lines = (n.sales_note_lines ?? []).map((l) => ({ net: l.amount, tax_code: l.tax_code, tax_amount: l.tax_amount }));
    const number = (Array.isArray(n.invoices) ? n.invoices[0] : (n.invoices as { invoice_number: string } | null))?.invoice_number ?? "";
    const parts: { kind: TaxKind; rate: number; value: number; tax: number }[] = [
      ...byCode(lines, "sales").map((p) => ({ kind: "sales" as const, ...p })),
      ...(n.kind === "debit" ? [] : splitService(lines, sen(n.sst_from_output)).map((p) => ({ kind: "service" as const, ...p }))),
    ];
    const note = { id: n.id, kind: n.kind as "credit" | "debit" | "refund", number: n.note_number };
    for (const p of parts) {
      if (within(n.note_date)) docs.push({ date: n.note_date, kind: "note", invoiceId: n.invoice_id, number, note, taxKind: p.kind, rate: p.rate, value: sign * p.value, tax: sign * p.tax });
      if (n.status === "void" && n.void_entry_id && within(n.voided_on))
        docs.push({ date: n.voided_on!, kind: "note_void", invoiceId: n.invoice_id, number, note, taxKind: p.kind, rate: p.rate, value: -sign * p.value, tax: -sign * p.tax });
    }
  }

  docs.sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number) || a.rate - b.rate);
  const rates = new Map<string, RateRow>();
  for (const d of docs) {
    const k = `${d.taxKind}:${d.rate}`;
    const cur = rates.get(k) ?? { kind: d.taxKind, rate: d.rate, value: 0, tax: 0 };
    cur.value += d.value;
    cur.tax += d.tax;
    rates.set(k, cur);
  }
  const byRate = [...rates.values()].sort((a, b) => (a.kind === b.kind ? a.rate - b.rate : a.kind === "sales" ? -1 : 1));
  const total = docs.reduce((s, d) => s + d.tax, 0);

  // Ledger reconciliation: 400-1300 movements from invoices, receipts, their voids and deemed moves only.
  let account = 0;
  if (outputAcct.data) {
    const { data: lines } = await supabase
      .from("journal_lines")
      .select("debit, credit, journal_entries!inner(occurred_on, source)")
      .eq("account_id", outputAcct.data.id)
      .gte("journal_entries.occurred_on", from)
      .lte("journal_entries.occurred_on", to)
      .in("journal_entries.source", ["invoice", "receipt", "void", "sst", "note", "credit"]);
    for (const l of lines ?? []) account += sen(l.credit) - sen(l.debit);
  }

  // Deemed payments whose day has come in this period but are not recorded yet (recorded when an editor opens SST).
  const today = todayMY();
  let waitingCount = 0;
  let waitingTax = 0;
  for (const inv of waiting.data ?? []) {
    const service = byCode(inv.invoice_lines as Line[], "service").reduce((s, p) => s + p.tax, 0) + sen(inv.service_adjust);
    const left = service - sen(inv.sst_released);
    const day = deemedDate(inv.invoice_date);
    if (left > 0 && day <= today && within(day)) {
      waitingCount++;
      waitingTax += left;
    }
  }

  return { byRate, docs, total, ledger: { account, gap: account - total, waiting: waitingCount, waitingTax } };
}

export type DeemedRow = {
  invoiceId: string;
  number: string;
  customer: string;
  invoiceDate: string;
  legalOn: string;
  recordedOn: string | null;
  state: "moved" | "waiting" | "not_moved";
  tax: number;
  voidedOn: string | null;
  takenBack: number;
};

/** /sst/deemed: service invoices whose 12 months end in the period (recorded moves, then those still to come). */
export async function loadDeemed(supabase: Supabase, orgId: string, from: string, to: string) {
  const [moves, open] = await Promise.all([
    supabase.from("sst_deemed_moves").select("invoice_id, legal_on, recorded_on, amount, reversed_on, invoices(invoice_number, invoice_date, contacts(name))").eq("org_id", orgId).gte("legal_on", from).lte("legal_on", to),
    supabase.from("invoices").select("id, invoice_number, invoice_date, sst_released, service_adjust, contacts(name), invoice_lines(net, tax_code, tax_amount)").eq("org_id", orgId).eq("status", "open"),
  ]);
  const today = todayMY();
  const rows: DeemedRow[] = [];
  for (const m of moves.data ?? []) {
    const inv = m.invoices as unknown as { invoice_number: string; invoice_date: string; contacts: { name: string } | null } | null;
    const tax = sen(m.amount);
    const voidHere = !!m.reversed_on && m.reversed_on >= from && m.reversed_on <= to;
    rows.push({
      invoiceId: m.invoice_id,
      number: inv?.invoice_number ?? "",
      customer: inv?.contacts?.name ?? "",
      invoiceDate: inv?.invoice_date ?? "",
      legalOn: m.legal_on,
      recordedOn: m.recorded_on,
      state: "moved",
      tax,
      voidedOn: m.reversed_on,
      takenBack: voidHere ? tax : 0,
    });
  }
  for (const inv of open.data ?? []) {
    const service = byCode(inv.invoice_lines as Line[], "service").reduce((s, p) => s + p.tax, 0) + sen(inv.service_adjust);
    const left = service - sen(inv.sst_released);
    const day = deemedDate(inv.invoice_date);
    if (left <= 0 || day < from || day > to) continue;
    rows.push({
      invoiceId: inv.id,
      number: inv.invoice_number,
      customer: (inv.contacts as unknown as { name: string } | null)?.name ?? "",
      invoiceDate: inv.invoice_date,
      legalOn: day,
      recordedOn: null,
      state: day <= today ? "waiting" : "not_moved",
      tax: left,
      voidedOn: null,
      takenBack: 0,
    });
  }
  rows.sort((a, b) => a.legalOn.localeCompare(b.legalOn) || a.number.localeCompare(b.number));
  const total = rows.reduce((s, r) => s + r.tax, 0);
  const takenBack = rows.reduce((s, r) => s + r.takenBack, 0);
  return { rows, total, takenBack };
}
