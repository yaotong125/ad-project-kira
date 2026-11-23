import Link from "next/link";
import type { OrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { cn } from "@/shared/ui/cn";
import { AddYearButton, LockYearButton } from "./controls";
import { loadFinancialYear } from "./load";

const TH = "border-b border-border px-[var(--pad-x)] py-2 text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted max-sm:text-[12.5px] pointer-coarse:text-[12.5px]";
const TD = "h-[var(--row-h)] border-b border-border px-[var(--pad-x)] align-middle text-ink";
const STAT = "flex flex-col gap-2.5 px-4 py-4 max-sm:flex-row max-sm:flex-wrap max-sm:items-baseline max-sm:justify-between max-sm:gap-x-3 max-sm:gap-y-0.5 max-sm:px-3.5 max-sm:py-2.5";
const EYEBROW = "text-[11.5px] font-medium uppercase tracking-[0.06em] text-muted";
const PANEL = "rounded-lg border border-border bg-surface p-4";

/** "2026-08-19 17:47:35" in Malaysia time, as lejar.ai prints close events. */
const stamp = (iso: string) => new Date(Date.parse(iso) + 8 * 3600_000).toISOString().slice(0, 19).replace("T", " ");

/**
 * /{slug}/periods: lejar.ai's Financial year (observed 2026-11-22 on the user's test entity and Lejar's demo
 * company): Open / Closing / Closed counts, "Add an earlier year", "Lock financial years", and the periods
 * with their close events and a "View transactions" link to the ledger. Close / reopen stay on the Ledger.
 */
export async function PeriodsPage({ ctx }: { ctx: OrgContext }) {
  const supabase = await createSupabaseServerClient();
  const base = `/${ctx.org.slug}`;
  const ms = ctx.lang === "ms";
  const canManage = ctx.role === "owner" || ctx.role === "admin";
  const fy = await loadFinancialYear(supabase, ctx.org.id);
  const count = (s: string) => fy.periods.filter((p) => p.status === s).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 py-1 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <h1 className="m-0 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">{ms ? "Tahun kewangan" : "Financial year"}</h1>
          <div className="mt-1.5 text-[12.5px] text-muted">
            <abbr
              className="cursor-help no-underline underline decoration-dotted underline-offset-2"
              title={
                ms
                  ? "Satu blok masa yang menyusun buku anda, biasanya sebulan. Menutup tempoh mengunci entrinya supaya laporan yang siap tidak berubah lagi."
                  : "A block of time your books are organised into, usually a month. Closing a period locks its entries so finished reports stop changing."
              }
            >
              {ms ? "Tempoh perakaunan" : "Accounting periods"}
            </abbr>{" "}
            {ms ? "& penutupan" : "& close"} · {ctx.org.legal_name}
          </div>
        </div>
      </div>

      <div className="card grid grid-cols-1 divide-y divide-border p-0 sm:grid-cols-3 sm:divide-x sm:divide-y-0" data-testid="period-counts">
        {(
          [
            ["open", ms ? "Dibuka" : "Open"],
            ["closing", ms ? "Sedang ditutup" : "Closing"],
            ["closed", ms ? "Ditutup" : "Closed"],
          ] as const
        ).map(([k, label]) => (
          <div key={k} className={STAT}>
            <div className={EYEBROW}>{label}</div>
            <div className="num-sans text-[20px] font-semibold leading-none tracking-[-0.02em] text-ink max-sm:ml-auto max-sm:text-right">{count(k)}</div>
          </div>
        ))}
      </div>

      {fy.earlier && (
        <div className={PANEL} data-testid="earlier-year-panel">
          <h2 className="text-[13px] font-semibold text-ink">{ms ? "Tambah tahun lebih awal" : "Add an earlier year"}</h2>
          <p className="mt-0.5 text-[12px] text-muted">
            {ms
              ? `Buku anda bermula pada ${fy.booksStart}. Tambah tahun sebelumnya untuk merekod bil, invois dan bayaran tahun itu pada tarikh yang tercetak. Sehingga 6 tahun kewangan ke belakang. Pemilik atau pentadbir sahaja.`
              : `Your books start on ${fy.booksStart}. Add the year before it to record that year's bills, invoices and payments on the dates they print. Up to 6 financial years back. Owner or admin only.`}
          </p>
          {fy.tooFar ? (
            <p className="mt-3 text-[12.5px] text-ink-2">
              {ms
                ? `Kira menambah sehingga 6 tahun kewangan ke belakang. Apa-apa yang lebih lama daripada ${fy.booksStart} kekal di luar buku anda.`
                : `Kira adds up to 6 financial years back. Anything older than ${fy.booksStart} stays outside your books.`}
            </p>
          ) : (
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="num text-[13px] font-medium text-ink">
                {fy.earlier.startsOn} → {fy.earlier.endsOn}
              </span>
              {canManage && <AddYearButton slug={ctx.org.slug} label={ms ? "Tambah tahun ini" : "Add this year"} busy={ms ? "Menambah..." : "Adding..."} />}
            </div>
          )}
        </div>
      )}

      <div className={PANEL} data-testid="lock-years">
        <h2 className="text-[13px] font-semibold text-ink">{ms ? "Kunci tahun kewangan" : "Lock financial years"}</h2>
        <p className="mt-0.5 text-[12px] text-muted">
          {ms
            ? "Mengunci tahun menyekat transaksi baharu (dan pembatalan) daripada direkodkan ke dalam mana-mana tempohnya, bagi mengelakkan transaksi dimasukkan ke tahun yang salah. Pemilik atau pentadbir sahaja."
            : "Locking a year blocks new transactions (and voids) from being posted into any of its periods, which guards against entering transactions in the wrong year. Owner or admin only."}
        </p>
        <ul className="mt-3 flex flex-col divide-y divide-border">
          {fy.years.map((y) => (
            <li key={y.id} className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-center gap-2 text-[13px]">
                <span className="num font-medium text-ink">
                  {y.startsOn} → {y.endsOn}
                </span>
                <span className="text-[12px] text-muted">
                  {y.periods} {ms ? "tempoh" : y.periods === 1 ? "period" : "periods"}
                </span>
                {y.locked && <span className="chip warn">{ms ? "dikunci" : "locked"}</span>}
              </div>
              {canManage && <LockYearButton slug={ctx.org.slug} yearId={y.id} locked={y.locked} label={y.locked ? (ms ? "Buka kunci tahun" : "Unlock year") : ms ? "Kunci tahun" : "Lock year"} />}
            </li>
          ))}
        </ul>
      </div>

      <div className="relative overflow-x-auto rounded-[var(--radius-lg)] border border-border">
        <table className="w-full border-collapse text-[13px] max-sm:text-[14px] pointer-coarse:text-[14px]" data-testid="periods-table">
          <thead className="bg-surface">
            <tr className="border-t border-border">
              <th className={cn(TH, "text-left")}>{ms ? "Tempoh" : "Period"}</th>
              <th className={cn(TH, "text-left")}>Status</th>
              <th className={cn(TH, "text-left")}>{ms ? "Peristiwa penutupan" : "Close events"}</th>
              <th className={cn(TH, "text-right")}>
                <span className="sr-only">{ms ? "Tindakan" : "Actions"}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {fy.periods.map((p) => (
              <tr key={p.id} className="border-t border-border align-top transition-colors hover:bg-surface-2">
                <td className={cn(TD, "text-left")}>
                  <div className="num whitespace-nowrap font-medium text-ink">
                    {p.startsOn} → {p.endsOn}
                  </div>
                  {p.closedAt && <div className="num text-[11.5px] text-muted">{ms ? "ditutup pada" : "closed at"} {stamp(p.closedAt)}</div>}
                </td>
                <td className={cn(TD, "text-left")}>
                  <div className="flex flex-wrap items-center gap-1">
                    <span className={cn("chip", p.status === "open" && "brand", p.status === "closing" && "warn")}>{p.status}</span>
                    {p.locked && <span className="chip warn">{ms ? "dikunci" : "locked"}</span>}
                  </div>
                </td>
                <td className={cn(TD, "text-left")}>
                  {p.events.length === 0 ? (
                    <span className="text-muted">{ms ? "Tiada" : "None"}</span>
                  ) : (
                    <ul className="flex flex-col gap-1 py-1.5">
                      {p.events.map((e, i) => (
                        <li key={i} className="text-[12px]">
                          <span className={cn("font-medium", e.action === "reopen" ? "text-warning" : "text-ink")}>{e.action}</span> <span className="num text-muted">{stamp(e.at)}</span>
                          {e.digest && (
                            <code className="kbd ml-1.5" title={e.digest}>
                              {e.digest.slice(0, 12)}
                            </code>
                          )}
                          {e.reason && <span className="ml-1.5 italic text-muted">{e.reason}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className={cn(TD, "text-right")}>
                  <Link href={`${base}/ledger?periodId=${p.id}`} className="text-[12.5px] font-medium text-ink-2 underline-offset-2 hover:text-ink hover:underline">
                    {ms ? "Lihat transaksi" : "View transactions"}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
