import Link from "next/link";
import { todayMY } from "@/features/books/load";
import { rm } from "@/features/books/money";
import { first, type SearchParams } from "@/shared/i18n";
import type { OrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { cn } from "@/shared/ui/cn";
import { loadSstPeriods, loadSstReturn, type DocRow, type TaxKind } from "./load";
import { currentPeriod, filingDue, type SstPeriod } from "./periods";

export const TD = "h-[var(--row-h)] border-b border-border px-[var(--pad-x)] align-middle";
export const TABLE_WRAP = "relative overflow-x-auto rounded-[var(--radius-lg)] border border-border";
export const TABLE = "w-full border-collapse text-[13px] max-sm:text-[14px] pointer-coarse:text-[14px]";
export const ROW = "border-t border-border transition-colors hover:bg-surface-2";
const EYEBROW = "text-[11.5px] font-medium uppercase tracking-[0.06em] text-muted";
const H3 = "text-[13px] font-medium text-ink-2";

/** lejar.ai's TermHint for "what is SST-02?" (glossary term sst-02), as a native hover hint. */
export function Sst02Term({ ms }: { ms: boolean }) {
  return (
    <abbr
      title={
        ms
          ? "Penyata Cukai Jualan dan Perkhidmatan yang difailkan oleh perniagaan Malaysia berdaftar SST kepada Kastam setiap dua bulan. Kira menyediakan angkanya daripada buku anda."
          : "The Sales and Service Tax return that SST-registered Malaysian businesses file with Customs every two months. Kira prepares the figures from your books."
      }
      className="cursor-help no-underline underline decoration-dotted underline-offset-2"
    >
      {ms ? "apakah SST-02?" : "what is SST-02?"}
    </abbr>
  );
}

export function PeriodNav({ periods, selected, href, title }: { periods: SstPeriod[]; selected?: SstPeriod; href: (p: SstPeriod) => string; title: string }) {
  return (
    <nav className="flex flex-col gap-0.5" aria-label={title} data-testid="sst-periods">
      <span className="px-2 pb-1.5 text-[11.5px] font-medium uppercase tracking-[0.06em] text-muted">{title}</span>
      {periods.map((p) => (
        <Link
          key={p.id}
          href={href(p)}
          aria-current={p.id === selected?.id ? "page" : undefined}
          className={cn(
            "num rounded-[var(--radius)] px-2.5 py-1.5 text-[12.5px] transition-colors",
            p.id === selected?.id ? "bg-brand-soft font-medium text-brand-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
          )}
        >
          {p.label}
        </Link>
      ))}
    </nav>
  );
}

const typeLabel = (kind: TaxKind, rate: number, ms: boolean, long: boolean) =>
  long ? `${ms ? (kind === "service" ? "Cukai perkhidmatan" : "Cukai jualan") : kind === "service" ? "Service tax" : "Sales tax"} ${rate}%` : `${ms ? (kind === "service" ? "Perkhidmatan" : "Jualan") : kind === "service" ? "Service" : "Sales"} ${rate}%`;

function docLabel(d: DocRow, ms: boolean): string {
  if (d.note) {
    const k = { credit: ms ? "Nota kredit" : "Credit note", debit: ms ? "Nota debit" : "Debit note", refund: ms ? "Nota bayaran balik" : "Refund note" }[d.note.kind];
    const label = `${k} ${d.note.number} · ${d.number}`;
    return d.kind === "note_void" ? `${ms ? "Batal" : "Void"} · ${label}` : label;
  }
  const inv = `${ms ? "Invois" : "Invoice"} ${d.number}`;
  const paid = `${ms ? "Bayaran diterima" : "Payment received"} · ${d.number}`;
  const deemed = `${ms ? "Pembayaran disifatkan" : "Deemed payment"} · ${d.number}`;
  const v = ms ? "Batal" : "Void";
  switch (d.kind) {
    case "invoice":
      return inv;
    case "receipt":
      return paid;
    case "deemed":
      return deemed;
    case "invoice_void":
      return `${v} · ${inv}`;
    case "receipt_void":
      return `${v} · ${paid}`;
    case "deemed_void":
      return `${v} · ${deemed}`;
    case "credit":
      return `${ms ? "Kredit pelanggan digunakan" : "Customer credit applied"} · ${d.number}`;
    case "credit_undo":
      return `${v} · ${ms ? "Kredit pelanggan digunakan" : "Customer credit applied"} · ${d.number}`;
    default:
      return inv;
  }
}

/**
 * /{slug}/sst: lejar.ai's SST-02 returns (observed 2026-11-22 on the user's test entity and Lejar's demo
 * company): periods on the left, the period card (output tax, basis, net SST payable), output tax by type and
 * rate, the documents behind the figure and the ledger reconciliation against 400-1300 SST Output Tax.
 */
export async function SstPage({ ctx, sp }: { ctx: OrgContext; sp: SearchParams }) {
  const supabase = await createSupabaseServerClient();
  const base = `/${ctx.org.slug}`;
  const ms = ctx.lang === "ms";
  // Deemed payments whose day has come are recorded when someone who can post opens SST (lejar.ai records them for you).
  if (ctx.role !== "viewer") {
    const { error } = await supabase.rpc("record_deemed_sst", { p_slug: ctx.org.slug });
    if (error) console.warn("[sst] deemed moves not recorded:", error.message);
  }
  const info = await loadSstPeriods(supabase, ctx.org.id, ctx.lang);
  const today = todayMY();
  const wanted = first(sp.periodId);
  const period = info.periods.find((p) => p.id === wanted) ?? currentPeriod(info.periods, today);

  const header = (
    <div className="flex flex-col gap-3 py-1 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <h1 className="m-0 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">{ms ? "Penyata SST-02" : "SST-02 returns"}</h1>
        <div className="mt-1.5 text-[12.5px] text-muted">
          {info.legalName} · {info.sstNumber ? `${ms ? "No. SST" : "SST no."} ${info.sstNumber}` : ms ? "tiada nombor SST dalam rekod" : "no SST number on file"} · <Sst02Term ms={ms} />
        </div>
      </div>
    </div>
  );
  if (!period) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <p className="text-[13px] text-muted">{ms ? "Tiada tempoh bercukai lagi." : "No taxable periods yet."}</p>
      </div>
    );
  }

  const ret = await loadSstReturn(supabase, ctx.org.id, period.startsOn, period.endsOn);
  const state = period.startsOn <= today && today <= period.endsOn ? "current" : period.endsOn < today ? "past" : "upcoming";
  const stateLabel = { current: ms ? "Tempoh semasa" : "Current period", past: ms ? "Tempoh lepas" : "Past period", upcoming: ms ? "Tempoh akan datang" : "Upcoming period" }[state];
  const locked = !!info.lockedUntil && info.lockedUntil >= period.endsOn;
  const deemedHref = `${base}/sst/deemed?periodId=${period.id}`;

  return (
    <div className="flex flex-col gap-6">
      {header}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-[200px_1fr]">
        <PeriodNav periods={info.periods} selected={period} href={(p) => `${base}/sst?periodId=${p.id}`} title={ms ? "Tempoh" : "Periods"} />
        <section className="flex flex-col gap-5" data-testid="sst-return">
          <div className="card overflow-hidden">
            <div className="bg-surface-2 px-5 py-4">
              <div className={EYEBROW}>{stateLabel}</div>
              <h2 className="num-sans mt-1 text-[18px] font-semibold tracking-[-0.02em] text-ink">
                SST-02 · {period.startsOn} → {period.endsOn}
              </h2>
              <p className="mt-1 text-[12.5px] text-muted">
                {ms
                  ? `Tarikh akhir pemfailan ${filingDue(period.endsOn)}, hari terakhir bulan selepas tempoh berakhir (Peraturan-Peraturan Cukai Perkhidmatan 2018, Per. 12).`
                  : `Filing due ${filingDue(period.endsOn)}, the last day of the month following period end (Service Tax Regulations 2018, Reg 12).`}
                {locked && (
                  <span className="ml-1 font-medium text-ink-2" data-testid="sst-locked">
                    {ms ? `Dikunci hingga ${info.lockedUntil}.` : `Locked to ${info.lockedUntil}.`}
                  </span>
                )}
              </p>
            </div>
            <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="p-4">
                <div className={EYEBROW}>{ms ? "Cukai output" : "Output tax"}</div>
                <div className="num-sans mt-1.5 text-[20px] font-semibold leading-none text-ink" data-testid="sst-output">
                  {rm(ret.total)}
                </div>
              </div>
              <div className="p-4">
                <div className={EYEBROW}>{ms ? "Asas" : "Basis"}</div>
                <p className="mt-1.5 text-[12.5px] leading-snug text-ink-2">
                  {ms
                    ? "Cukai jualan pada tarikh invois. Cukai perkhidmatan apabila bayaran diterima, atau pada hari selepas 12 bulan dari tarikh invois jika belum dibayar. Tiada cukai input ditolak."
                    : "Sales tax on the invoice date. Service tax on payment received, or on the day after 12 months from the invoice date if unpaid. No input tax is deducted."}
                </p>
              </div>
              <div className="bg-brand-soft/60 p-4">
                <div className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-brand">{ms ? "SST bersih perlu dibayar" : "Net SST payable"}</div>
                <div className="num-sans mt-1.5 text-[20px] font-semibold leading-none text-brand-ink" data-testid="sst-net">
                  {rm(ret.total)}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className={H3}>{ms ? "Cukai output mengikut jenis dan kadar" : "Output tax by type and rate"}</h3>
            {ret.docs.length === 0 ? (
              <p className="rounded-[var(--radius-lg)] border border-border bg-surface-2 px-3 py-2.5 text-[13px] text-ink-2">
                {ms ? "Tiada invois, nota atau bayaran diterima yang dikenakan cukai dalam tempoh ini. Penyata kosong tetap perlu difailkan." : "No taxed invoices, notes or payments received in this period. A nil return is still due."}
              </p>
            ) : (
              <div className={TABLE_WRAP}>
                <table className={TABLE} data-testid="sst-by-rate">
                  <tbody>
                    {ret.byRate.map((r) => (
                      <tr key={`${r.kind}${r.rate}`} className={ROW}>
                        <td className={cn(TD, "text-left text-ink")}>{typeLabel(r.kind, r.rate, ms, true)}</td>
                        <td className={cn(TD, "num-sans text-right text-ink-2")}>{rm(r.value)}</td>
                        <td className={cn(TD, "num-sans text-right text-ink")}>{rm(r.tax)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-ink transition-colors hover:bg-surface-2">
                      <td className={cn(TD, "text-left font-semibold text-ink")} colSpan={2}>
                        {ms ? "Jumlah cukai output" : "Total output tax"}
                      </td>
                      <td className={cn(TD, "num-sans text-right font-semibold text-ink")}>{rm(ret.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {ret.docs.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className={H3}>{ms ? "Dokumen di sebalik angka" : "Documents behind the figure"}</h3>
              <p className="text-[12.5px] text-muted">
                {ms
                  ? "Cukai perkhidmatan pada sesuatu bayaran ialah bahagian bayaran itu daripada cukai perkhidmatan invois. Baris-baris ini dijumlahkan kepada jumlah cukai output. Invois atau bayaran yang dibatalkan ditunjukkan sebagai baris negatif pada tarikh pembatalannya."
                  : "Service tax on a payment is the payment's share of the invoice's service tax. The rows add up to the total output tax. A voided invoice or payment shows as a negative line on its void date."}
              </p>
              <div className={TABLE_WRAP}>
                <table className={TABLE} data-testid="sst-docs">
                  <tbody>
                    {ret.docs.map((d, i) => (
                      <tr key={i} className={ROW}>
                        <td className={cn(TD, "num w-28 whitespace-nowrap text-left text-[12px] text-ink-2")}>{d.date}</td>
                        <td className={cn(TD, "text-left text-ink")}>
                          <Link href={d.note ? `${base}/notes/${d.note.id}` : `${base}/invoices/${d.invoiceId}`} className="text-ink underline-offset-2 hover:underline">
                            {docLabel(d, ms)}
                          </Link>
                        </td>
                        <td className={cn(TD, "text-left text-[12px] text-ink-2")}>{typeLabel(d.taxKind, d.rate, ms, false)}</td>
                        <td className={cn(TD, "num-sans text-right text-ink")}>{rm(d.tax)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <h3 className={H3}>{ms ? "Penyesuaian lejar" : "Ledger reconciliation"}</h3>
            <p className="text-[12.5px] text-muted">
              {ms
                ? "Akaun output SST bagi tempoh ini, daripada invois, bayaran diterima dan pemindahan cukai perkhidmatan sahaja (bayaran kepada Kastam tidak dikira), berbanding penyata. "
                : "The SST output account for this period, from invoices, payments received and service tax moves only (payments to Customs left out), against the return. "}
              <Link href={deemedHref} className="text-brand hover:underline">
                {ms ? "Pembayaran disifatkan" : "Deemed payments"}
              </Link>
            </p>
            <div className={TABLE_WRAP}>
              <table className={TABLE} data-testid="sst-reconciliation">
                <tbody>
                  <tr className={ROW}>
                    <td className={cn(TD, "text-left text-ink")}>{ms ? "Akaun output SST (invois, bayaran, pemindahan cukai perkhidmatan)" : "SST output account (invoices, payments, service tax moves)"}</td>
                    <td className={cn(TD, "num-sans text-right text-ink")}>{rm(ret.ledger.account)}</td>
                  </tr>
                  <tr className={ROW}>
                    <td className={cn(TD, "text-left text-ink")}>{ms ? "Cukai output dalam penyata ini" : "Output tax on this return"}</td>
                    <td className={cn(TD, "num-sans text-right text-ink")}>{rm(ret.total)}</td>
                  </tr>
                  {ret.ledger.waiting > 0 && (
                    <tr className={ROW}>
                      <td className={cn(TD, "text-left text-ink")}>
                        {ms ? `Pembayaran disifatkan menunggu untuk direkodkan (${ret.ledger.waiting})` : `Deemed payments waiting to be recorded (${ret.ledger.waiting})`}
                      </td>
                      <td className={cn(TD, "num-sans text-right text-ink")}>{rm(ret.ledger.waitingTax)}</td>
                    </tr>
                  )}
                  {ret.ledger.gap !== 0 && (
                    <tr className={ROW}>
                      <td className={cn(TD, "text-left text-ink")}>
                        {ms
                          ? "Perbezaan: catatan bertarikh dalam tempoh lain daripada tarikh penyata mengiranya (contohnya pembayaran disifatkan yang direkodkan selepas penguncian cukai)"
                          : "Difference: entries dated in another period than the return counts them (for example a deemed payment recorded after the tax lock)"}
                      </td>
                      <td className={cn(TD, "num-sans text-right text-ink")} data-testid="sst-gap">
                        {rm(ret.ledger.gap)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
