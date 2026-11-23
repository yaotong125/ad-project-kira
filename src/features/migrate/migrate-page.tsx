import { CircleHelp } from "lucide-react";
import Link from "next/link";
import { rm } from "@/features/books/money";
import type { OrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { cn } from "@/shared/ui/cn";
import { loadMigrateData } from "./load";
import { MigrateWizard, ReverseMigrationButton } from "./migrate-client";
import { SOURCE_META } from "./types";

const TH = "border-b border-border px-[var(--pad-x)] py-2 text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted";
const TD = "h-[var(--row-h)] border-b border-border px-[var(--pad-x)] align-middle";

/** /{slug}/migrate: Bring opening balances across from CSV/Excel, Xero, Sage UBS, or manual entry. */
export async function MigratePage({ ctx }: { ctx: OrgContext }) {
  const supabase = await createSupabaseServerClient();
  const data = await loadMigrateData(supabase, ctx.org.id);
  const base = `/${ctx.org.slug}`;
  const isAdmin = ctx.role === "owner" || ctx.role === "admin";
  const ms = ctx.lang === "ms";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 py-1">
        <h1 className="m-0 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">
          {ms ? "Pindahkan buku anda" : "Bring your books across"}
        </h1>
        <div className="text-[12.5px] text-muted">
          {ctx.org.legal_name} · opening balances at cutover · books start{" "}
          <span className="num text-ink">{data.booksStart}</span>
        </div>
        <details className="mt-1 max-w-[680px]">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-[12.5px] text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
            <CircleHelp size={13} aria-hidden="true" /> Learn about this page
          </summary>
          <div className="mt-2 space-y-1.5 rounded-[var(--radius)] border border-border bg-surface p-3.5 text-[12.5px] leading-relaxed text-ink-2">
            <p className="m-0">
              Kira starts your books at a cutover date. Export the Trial Balance as at the day before cutover from Xero,
              Sage UBS, SQL Account, AutoCount, MYOB, or a spreadsheet, map each account, and commit.
            </p>
            <p className="m-0">
              Asset, liability, and equity balances become one opening entry, and prior year-to-date income and expenses
              fold into {data.retainedEarningsLabel}. Historical profit and loss stays in your old system.
            </p>
          </div>
        </details>
      </div>

      {isAdmin ? (
        <MigrateWizard
          orgSlug={ctx.org.slug}
          accounts={data.accounts}
          retainedEarningsLabel={data.retainedEarningsLabel}
          defaultCutover={data.defaultCutover}
          openRange={data.openRange}
        />
      ) : (
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-3 text-[12.5px] text-muted">
          An owner or admin can open Migrate and commit opening balances for {ctx.org.legal_name}.
        </div>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-[14px] font-semibold text-ink">Migration history ({data.history.length})</h2>
        {data.history.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted">
            No opening balance migrations recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
            <table className="w-full border-collapse text-[13px]" data-testid="migrate-history">
              <thead className="bg-surface">
                <tr>
                  <th className={cn(TH, "text-left")}>Cutover</th>
                  <th className={cn(TH, "text-left")}>Source</th>
                  <th className={cn(TH, "text-right")}>Total</th>
                  <th className={cn(TH, "text-left")}>Status</th>
                  <th className={cn(TH, "text-right")}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((h) => (
                  <tr key={h.id} className="border-t border-border transition-colors hover:bg-surface-2">
                    <td className={cn(TD, "num whitespace-nowrap text-ink")}>{h.cutoverDate}</td>
                    <td className={cn(TD, "py-2")}>
                      <div className="font-medium text-ink">{SOURCE_META[h.sourceSystem].title}</div>
                      <div className="text-[11.5px] text-muted">
                        <span className="num">{h.lineCount}</span> lines{h.foldedPnl ? " · P&L folded" : ""}
                        {h.notes ? ` · ${h.notes}` : ""}
                      </div>
                    </td>
                    <td className={cn(TD, "num-sans whitespace-nowrap text-right font-medium text-ink")}>
                      {rm(h.totalSen)}
                    </td>
                    <td className={cn(TD, "whitespace-nowrap")}>
                      <span className={h.status === "committed" ? "chip pos" : "chip"}>
                        {h.status === "committed" ? "Committed" : "Reversed"}
                      </span>
                    </td>
                    <td className={cn(TD, "whitespace-nowrap text-right")}>
                      <div className="inline-flex flex-wrap items-center justify-end gap-2">
                        <Link
                          href={`${base}/ledger/entries/${h.journalEntryId}`}
                          className="font-medium text-brand hover:underline"
                        >
                          View entry
                        </Link>
                        {h.reversalEntryId && (
                          <Link
                            href={`${base}/ledger/entries/${h.reversalEntryId}`}
                            className="text-muted hover:text-ink hover:underline"
                          >
                            Reversal
                          </Link>
                        )}
                        {isAdmin && h.status === "committed" && (
                          <ReverseMigrationButton orgSlug={ctx.org.slug} id={h.id} />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
