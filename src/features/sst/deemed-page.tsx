import Link from "next/link";
import { todayMY } from "@/features/books/load";
import { rm } from "@/features/books/money";
import { first, type SearchParams } from "@/shared/i18n";
import type { OrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { cn } from "@/shared/ui/cn";
import { loadDeemed, loadSstPeriods } from "./load";
import { currentPeriod } from "./periods";
import { PeriodNav, ROW, TABLE, TABLE_WRAP, TD } from "./sst-page";

const TH = "border-b border-border px-[var(--pad-x)] py-2 text-left text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted";

/**
 * /{slug}/sst/deemed: lejar.ai's Deemed payments (observed 2026-11-22, strings sst.deemed.*): service invoices
 * unpaid 12 months after the invoice date, by the taxable period they are deemed paid in.
 */
export async function DeemedPage({ ctx, sp }: { ctx: OrgContext; sp: SearchParams }) {
  const supabase = await createSupabaseServerClient();
  const base = `/${ctx.org.slug}`;
  const ms = ctx.lang === "ms";
  if (ctx.role !== "viewer") await supabase.rpc("record_deemed_sst", { p_slug: ctx.org.slug });
  const info = await loadSstPeriods(supabase, ctx.org.id, ctx.lang);
  const wanted = first(sp.periodId);
  const found = info.periods.find((p) => p.id === wanted);
  const period = found ?? currentPeriod(info.periods, todayMY());
  const data = period ? await loadDeemed(supabase, ctx.org.id, period.startsOn, period.endsOn) : { rows: [], total: 0, takenBack: 0 };

  const status = (r: (typeof data.rows)[number]) =>
    r.state === "moved" ? r.recordedOn : r.state === "waiting" ? (ms ? "Menunggu untuk direkodkan" : "Waiting to be recorded") : ms ? "Belum dipindahkan" : "Not moved yet";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 py-1 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <h1 className="m-0 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">{ms ? "Pembayaran disifatkan" : "Deemed payments"}</h1>
          <p className="mt-1.5 max-w-[72ch] text-[12.5px] text-muted">
            {ms
              ? "Invois perkhidmatan yang belum dibayar 12 bulan selepas tarikh invois. Undang-undang menyifatkannya dibayar pada hari berikutnya, dan penyata SST-02 melaporkan cukainya pada hari itu."
              : "Service invoices unpaid 12 months after the invoice date. The law treats them as paid on the next day, and the SST-02 return files their tax on that day."}
          </p>
          <div className="mt-1.5">
            <Link href={`${base}/sst${period ? `?periodId=${period.id}` : ""}`} className="text-[12.5px] text-brand hover:underline">
              {ms ? "Penyata SST-02" : "SST-02 returns"}
            </Link>
          </div>
        </div>
      </div>
      {wanted && !found && (
        <p className="rounded-[var(--radius-lg)] border border-border bg-surface-2 px-3 py-2.5 text-[13px] text-ink-2">
          {ms ? "Tempoh itu tidak dijumpai. Pilih tempoh daripada senarai." : "That period could not be found. Pick a period from the list."}
        </p>
      )}
      <p className="text-[12.5px] text-muted">
        {ms
          ? "Senarai ini menunjukkan invois yang disifatkan dibayar dalam tempoh ini. Pembatalan atau nota kredit yang bertarikh dalam tempoh kemudian muncul dalam penyata SST-02 tempoh itu, bukan di sini."
          : "This list shows invoices deemed paid in the period. A void or credit note dated in a later period shows in that period's SST-02 return, not here."}
      </p>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-[200px_1fr]">
        <PeriodNav periods={info.periods} selected={period} href={(p) => `${base}/sst/deemed?periodId=${p.id}`} title={ms ? "Tempoh bercukai" : "Taxable periods"} />
        <section className="flex flex-col gap-2" data-testid="sst-deemed">
          {data.rows.length === 0 ? (
            <p className="rounded-[var(--radius-lg)] border border-border bg-surface-2 px-3 py-2.5 text-[13px] text-ink-2">
              {ms ? "Tiada invois perkhidmatan yang mencapai tarikh 12 bulan dalam tempoh ini." : "No service invoice reached its 12-month date in this period."}
            </p>
          ) : (
            <div className={TABLE_WRAP}>
              <table className={TABLE}>
                <thead>
                  <tr>
                    <th className={TH}>{ms ? "Invois" : "Invoice"}</th>
                    <th className={TH}>{ms ? "Pelanggan" : "Customer"}</th>
                    <th className={TH}>{ms ? "Tarikh invois" : "Invoice date"}</th>
                    <th className={TH}>{ms ? "Disifatkan dibayar pada" : "Deemed paid on"}</th>
                    <th className={TH}>{ms ? "Dipindahkan ke output SST pada" : "Moved to SST output on"}</th>
                    <th className={cn(TH, "text-right")}>{ms ? "Cukai dipindahkan" : "Tax moved"}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={`${r.invoiceId}${r.legalOn}`} className={ROW}>
                      <td className={cn(TD, "text-left")}>
                        <Link href={`${base}/invoices/${r.invoiceId}`} className="text-ink underline-offset-2 hover:underline">
                          {r.number}
                        </Link>
                        {r.voidedOn && (
                          <div className="mt-0.5 text-[11.5px] text-muted">
                            {ms
                              ? `Dibatalkan pada ${r.voidedOn}. Penyata SST-02 bagi tempoh tarikh pembatalan mengambil balik cukai yang disifatkan.`
                              : `Voided on ${r.voidedOn}. The SST-02 return for the period of the void date takes the deemed tax back.`}
                            {r.takenBack > 0 && ` ${ms ? `Pembatalan mengambil balik ${rm(r.takenBack)} dalam tempoh ini.` : `The void takes back ${rm(r.takenBack)} in this period.`}`}
                          </div>
                        )}
                      </td>
                      <td className={cn(TD, "text-left text-ink-2")}>{r.customer}</td>
                      <td className={cn(TD, "num whitespace-nowrap text-left text-[12px] text-ink-2")}>{r.invoiceDate}</td>
                      <td className={cn(TD, "num whitespace-nowrap text-left text-[12px] text-ink-2")}>{r.legalOn}</td>
                      <td className={cn(TD, "text-left text-[12px] text-ink-2", r.state === "moved" && "num")}>{status(r)}</td>
                      <td className={cn(TD, "num-sans text-right text-ink")}>{rm(r.tax)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-ink">
                    <td className={cn(TD, "text-left font-semibold text-ink")} colSpan={5}>
                      {data.takenBack > 0
                        ? ms
                          ? "Jumlah cukai disifatkan, tolak cukai yang diambil balik oleh pembatalan dalam tempoh ini"
                          : "Total deemed tax, less the tax that voids in this period take back"
                        : ms
                          ? "Jumlah cukai disifatkan"
                          : "Total deemed tax"}
                    </td>
                    <td className={cn(TD, "num-sans text-right font-semibold text-ink")} data-testid="sst-deemed-total">
                      {rm(data.total - data.takenBack)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
