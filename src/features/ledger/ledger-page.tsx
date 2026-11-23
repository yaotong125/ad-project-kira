import { CircleHelp } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { todayMY } from "@/features/books/load";
import { rm } from "@/features/books/money";
import { CsvButton } from "@/features/reports/csv-button";
import { first, type SearchParams } from "@/shared/i18n";
import type { OrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { buttonClass } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";
import { CloseOrReopen, HideVoidedToggle, LedgerTabs, PeriodRangeSelect, ReverseEntryButton, VoidEntryButton } from "./controls";
import { SOURCE_LABEL, dmy, loadEntries, loadPeriods, resolveRange, trialBalance } from "./load";

const TH = "border-b border-border px-[var(--pad-x)] py-2 text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted max-sm:text-[12.5px] pointer-coarse:text-[12.5px]";
const TD = "h-[var(--row-h)] border-b border-border px-[var(--pad-x)] align-middle";
const STAT = "flex flex-col gap-2.5 px-4 py-4 max-sm:flex-row max-sm:flex-wrap max-sm:items-baseline max-sm:justify-between max-sm:gap-x-3 max-sm:gap-y-0.5 max-sm:px-3.5 max-sm:py-2.5";
const STAT_V = "num-sans text-[20px] font-semibold leading-none tracking-[-0.02em] max-sm:ml-auto max-sm:text-right";
const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const plain = (sen: number) => (sen / 100).toFixed(2);

/** Hover hint like lejar.ai's TermHint (dotted underline, native title). */
function Term({ children, hint }: { children: string; hint: string }) {
  return (
    <abbr title={hint} className="cursor-help no-underline underline decoration-dotted underline-offset-2">
      {children}
    </abbr>
  );
}

/**
 * /{slug}/ledger: lejar.ai's Ledger (observed 2026-11-22): period range, the closing period's status with
 * Close / Reopen, a "Setup is not finished" link, Total debits / Total credits / Posted entries, and tabs
 * Trial balance (CSV, PDF) and Entries ("Do not display voided transactions", Reverse, Void).
 */
export async function LedgerPage({ ctx, sp }: { ctx: OrgContext; sp: SearchParams }) {
  const supabase = await createSupabaseServerClient();
  const base = `/${ctx.org.slug}`;
  const ms = ctx.lang === "ms";
  const canEdit = ctx.role !== "viewer";
  const canManage = ctx.role === "owner" || ctx.role === "admin";
  const periods = await loadPeriods(supabase, ctx.org.id);
  const { from, to } = resolveRange(periods, first(sp.fromPeriodId) ?? first(sp.periodId), first(sp.toPeriodId) ?? first(sp.periodId));
  if (!from || !to) return <p className="text-[13px] text-muted">No accounting periods yet.</p>;
  const hideVoided = (await cookies()).get("kira_hide_voided")?.value !== "0";

  const [tb, list, org] = await Promise.all([
    trialBalance(supabase, ctx.org.id, to.endsOn),
    loadEntries(supabase, ctx.org.id, from.startsOn, to.endsOn, hideVoided),
    supabase.from("organizations").select("registration_number, sst_number, tin, setup_hidden").eq("id", ctx.org.id).single(),
  ]);
  const setupOpen = !org.data?.setup_hidden && (!org.data?.registration_number || !org.data?.sst_number || !org.data?.tin);
  const today = todayMY();

  const csv = [["Code", "Account", "Debit", "Credit"], ...tb.rows.map((r) => [r.code, r.name, r.debit ? plain(r.debit) : "", r.credit ? plain(r.credit) : ""]), ["", "Totals", plain(tb.debit), plain(tb.credit)]]
    .map((r) => r.map(csvCell).join(","))
    .join("\n");

  const trialPanel = (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="num text-[13px] text-muted">as of {to.endsOn}</span>
          <CsvButton csv={csv} fileName={`trial-balance-${to.endsOn}.csv`} />
          <a href={`${base}/ledger/trial-balance/pdf?periodId=${to.id}`} className={buttonClass("secondary", "sm")}>
            Download PDF
          </a>
        </div>
      </div>
      <div className="relative overflow-x-auto rounded-[var(--radius-lg)] border border-border">
        <table className="w-full border-collapse text-[13px] max-sm:text-[14px] pointer-coarse:text-[14px]" data-testid="trial-balance">
          <thead className="bg-surface">
            <tr className="border-t border-border">
              <th className={cn(TH, "text-left")}>Code</th>
              <th className={cn(TH, "text-left")}>Account</th>
              <th className={cn(TH, "text-right")}>
                <Term hint="Assets and expenses normally carry a debit balance.">Debit</Term>
              </th>
              <th className={cn(TH, "text-right")}>
                <Term hint="Liabilities, equity and income normally carry a credit balance.">Credit</Term>
              </th>
            </tr>
          </thead>
          <tbody>
            {tb.rows.length === 0 ? (
              <tr>
                <td className={cn(TD, "py-8 text-center text-muted")} colSpan={4}>
                  No entries yet.
                </td>
              </tr>
            ) : (
              tb.rows.map((r) => (
                <tr key={r.code} className="border-t border-border transition-colors hover:bg-surface-2">
                  <td className={cn(TD, "num text-ink-2")}>{r.code}</td>
                  <td className={cn(TD, "text-ink")}>{r.name}</td>
                  <td className={cn(TD, "num-sans text-right text-ink")}>{r.debit ? rm(r.debit) : ""}</td>
                  <td className={cn(TD, "num-sans text-right text-ink")}>{r.credit ? rm(r.credit) : ""}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border-strong">
              <td className={cn(TD, "text-left font-semibold text-ink")} colSpan={2}>
                <span className="inline-flex items-center gap-2">
                  Totals<span className={tb.balanced ? "chip pos" : "chip neg"}>{tb.balanced ? "Balanced" : "Out of balance"}</span>
                </span>
              </td>
              <td className={cn(TD, "num-sans text-right font-semibold text-ink")}>{rm(tb.debit)}</td>
              <td className={cn(TD, "num-sans text-right font-semibold text-ink")}>{rm(tb.credit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );

  const entriesPanel = (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12.5px] text-muted">In this period{list.total > list.entries.length ? ` · showing the latest ${list.entries.length} of ${list.total}` : ""}</span>
        <HideVoidedToggle hideVoided={hideVoided} label={ms ? "Jangan paparkan transaksi yang dibatalkan" : "Do not display voided transactions"} />
      </div>
      {list.entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border py-12 text-center">
          <p className="m-0 text-sm font-medium text-ink">No entries posted yet</p>
          <div className="text-[13px] text-muted">Post a manual journal voucher from the Journal entries tab, or import a bank statement.</div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
          <table className="w-full border-collapse text-[13px]" data-testid="ledger-entries">
            <thead className="bg-surface">
              <tr>
                <th className={cn(TH, "text-left")}>Date</th>
                <th className={cn(TH, "text-left")}>Entry</th>
                <th className={cn(TH, "text-left")}>Source</th>
                <th className={cn(TH, "text-left")}>Description</th>
                <th className={cn(TH, "text-right")}>Amount</th>
                <th className={cn(TH, "text-left")}>Status</th>
                <th className={cn(TH, "text-right")}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.entries.map((e) => {
                const status = e.voided ? ["Void", "chip"] : e.reversedBy ? ["Reversed", "chip warn"] : ["Posted", "chip pos"];
                const manual = e.source === "manual" && !e.voided && !e.reversedBy;
                return (
                  <tr key={e.id} className={cn("align-top transition-colors hover:bg-surface-2", e.voided && "text-muted")}>
                    <td className={cn(TD, "num-sans whitespace-nowrap py-2 text-ink-2")}>{e.date}</td>
                    <td className={cn(TD, "whitespace-nowrap py-2")}>
                      <Link href={`${base}/ledger/entries/${e.id}`} className="num font-medium text-ink hover:underline">
                        {e.number ?? e.docs ?? "View"}
                      </Link>
                    </td>
                    <td className={cn(TD, "py-2")}>
                      <span className="chip">{SOURCE_LABEL[e.source]?.[ms ? 1 : 0] ?? e.source}</span>
                    </td>
                    <td className={cn(TD, "py-2")}>
                      <div className={cn(e.voided ? "text-muted" : "text-ink")}>{e.party ?? e.memo ?? "-"}</div>
                      {((e.docs && e.docs !== e.number && e.number) || (e.party && e.memo && !(e.docs && e.memo.includes(e.docs))) || e.voidReason) && (
                        <div className="text-[11.5px] text-muted">
                          {[e.docs && e.docs !== e.number ? e.docs : null, e.party && e.memo && !(e.docs && e.memo.includes(e.docs)) ? e.memo : null, e.voidReason ? `Void: ${e.voidReason}` : null].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </td>
                    <td className={cn(TD, "num whitespace-nowrap py-2 text-right", e.voided ? "line-through" : "text-ink")}>{rm(e.amount)}</td>
                    <td className={cn(TD, "py-2")}>
                      <span className={status[1]}>{status[0]}</span>
                    </td>
                    <td className={cn(TD, "py-1.5")}>
                      {canEdit && manual && (
                        <div className="flex flex-wrap items-start justify-end gap-1">
                          <ReverseEntryButton orgSlug={ctx.org.slug} entryId={e.id} defaultOn={today < e.date ? e.date : today} minOn={e.date} />
                          <VoidEntryButton orgSlug={ctx.org.slug} entryId={e.id} />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 py-1">
        <div className="min-w-[260px] flex-1">
          <h1 className="m-0 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">{ms ? "Lejar" : "Ledger"}</h1>
          <div className="mt-1.5 text-[12.5px] text-muted">
            {ctx.org.legal_name} · <Term hint="An accounting period is the stretch of time your entries are grouped in; close it once it is done.">period</Term>{" "}
            <span className="num whitespace-nowrap text-ink">
              {dmy(from.startsOn)} → {dmy(to.endsOn)}
            </span>
          </div>
          <details className="mt-1.5 max-w-[620px]">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[12px] text-muted transition-colors hover:text-ink">
              <CircleHelp size={12} aria-hidden="true" /> {ms ? "Ketahui tentang halaman ini" : "Learn about this page"}
            </summary>
            {/* lejar.ai help articles "ledger" and "periods", Lejar → Kira */}
            <div className="mt-2 flex flex-col gap-2 rounded-[var(--radius)] border border-border bg-surface px-3 py-2.5 text-[12.5px] leading-[1.6] text-ink-2">
              <p className="m-0">
                The Ledger page lists every journal entry posted in the period range you pick, with the trial balance for the closing period. It is the raw feed behind every report.
              </p>
              <ul className="m-0 flex list-disc flex-col gap-1 pl-4">
                <li>The trial balance shows each account with its total debits and credits. When books are healthy the two columns are equal.</li>
                <li>Each entry shows its source: a bill, an invoice, a bank import, or a manual entry.</li>
                <li>Reverse cancels an entry with an opposite one; void strikes a manual entry from the books while keeping it visible for audit.</li>
                <li>When a month is done and reconciled, close it. Reports for that month are now stable. Need to fix something in a closed month? Reopen it, correct, and close again. The audit trail records it.</li>
              </ul>
            </div>
          </details>
        </div>
        <div className="flex flex-wrap items-start gap-3 sm:justify-end">
          <PeriodRangeSelect periods={periods} fromId={from.id} toId={to.id} lang={ctx.lang} />
          <CloseOrReopen key={`${to.id}:${to.status}`} orgSlug={ctx.org.slug} period={to} canManage={canManage} />
        </div>
      </div>

      {setupOpen && (
        <Link href={`${base}#finish-setup`} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-2.5 text-[13px] transition-colors hover:bg-surface-2">
          <span className="text-ink-2">Setup is not finished yet. Open Finish setup on the dashboard to see what is left.</span>
          <span aria-hidden="true" className="text-muted">
            →
          </span>
        </Link>
      )}

      <div className="card grid grid-cols-1 divide-y divide-border p-0 sm:grid-cols-3 sm:divide-x sm:divide-y-0" data-testid="ledger-stats">
        <div className={STAT}>
          <div className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-muted">Total debits</div>
          <div className={cn(STAT_V, "text-ink")}>{rm(tb.debit)}</div>
          <div className="text-[11.5px] text-muted max-sm:order-last max-sm:w-full">As of {to.endsOn}</div>
        </div>
        <div className={STAT}>
          <div className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-muted">Total credits</div>
          <div className={cn(STAT_V, "text-ink")}>{rm(tb.credit)}</div>
          <div className="text-[11.5px] text-muted max-sm:order-last max-sm:w-full">As of {to.endsOn}</div>
        </div>
        <div className={STAT}>
          <div className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-muted">Posted entries</div>
          <div className={cn(STAT_V, "text-ink")}>{list.posted}</div>
          <div className={cn("text-[11.5px] max-sm:order-last max-sm:w-full", tb.balanced ? "text-muted" : "text-negative")}>
            {tb.balanced ? "Trial balance is balanced" : `Trial balance is out by ${rm(Math.abs(tb.debit - tb.credit))}`}
          </div>
        </div>
      </div>

      <LedgerTabs
        label="Ledger sections"
        tabs={[
          { key: "trial-balance", label: "Trial balance", panel: trialPanel },
          { key: "entries", label: "Entries", count: list.posted, panel: entriesPanel },
        ]}
      />
    </div>
  );
}
