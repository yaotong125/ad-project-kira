import { ArrowLeft, CircleHelp } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { todayMY } from "@/features/books/load";
import { rm } from "@/features/books/money";
import { first, type SearchParams } from "@/shared/i18n";
import type { OrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { cn } from "@/shared/ui/cn";
import { loadTransferDetail, loadTransfersData } from "./load";
import { NewTransferPanel, VoidTransferControl } from "./transfers-client";

const TH = "border-b border-border px-[var(--pad-x)] py-2 text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted";
const TD = "h-[var(--row-h)] border-b border-border px-[var(--pad-x)] align-middle";

/** /{slug}/banking/transfers: lejar.ai's Bank transfers list + New transfer panel. */
export async function TransfersListPage({ ctx, sp }: { ctx: OrgContext; sp: SearchParams }) {
  const supabase = await createSupabaseServerClient();
  const data = await loadTransfersData(supabase, ctx.org.id);
  const base = `/${ctx.org.slug}`;
  const canEdit = ctx.role !== "viewer";
  const ms = ctx.lang === "ms";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 py-1">
        <div className="min-w-0">
          <h1 className="m-0 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">
            {ms ? "Pindahan" : "Transfers"}
          </h1>
          <div className="mt-1.5 text-[12.5px] text-muted">
            {ctx.org.legal_name} · Money moved between your own bank and cash accounts.
          </div>
          <details className="mt-1.5 max-w-[620px]">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[12px] text-muted transition-colors hover:text-ink">
              <CircleHelp size={12} aria-hidden="true" />{" "}
              {ms ? "Ketahui tentang halaman ini" : "Learn about this page"}
            </summary>
            <div className="mt-2 flex flex-col gap-2 rounded-[var(--radius)] border border-border bg-surface px-3 py-2.5 text-[12.5px] leading-[1.6] text-ink-2">
              <p className="m-0">Move money between two of your own bank or cash accounts, with an optional bank fee.</p>
              <ul className="m-0 flex list-disc flex-col gap-1 pl-4">
                <li>Pick the account the money leaves and the account it arrives in. Both must be bank or cash accounts, and they must be different.</li>
                <li>Kira posts one journal: the destination goes up by the amount and the source goes down by the amount plus any fee (posted to Bank Charges).</li>
                <li>A transfer shows as one line in the reconciliation of each account: money out on the source and money in on the destination.</li>
              </ul>
            </div>
          </details>
        </div>
      </div>

      {!canEdit ? (
        <p className="card m-0 px-4 py-3 text-[13px] text-muted">
          Read-only view. Your viewer role cannot record transfers. Ask an owner or admin to make changes.
        </p>
      ) : (
        <NewTransferPanel
          orgSlug={ctx.org.slug}
          today={data.today}
          initialOpen={first(sp.new) === "1"}
          cashAccounts={data.cashAccounts}
        />
      )}

      {data.transfers.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1 rounded-[var(--radius-lg)] border border-dashed border-border py-12 text-center">
          <p className="m-0 text-[13.5px] font-medium text-ink">No transfers yet. Press Transfer to record one.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
          <table className="w-full border-collapse text-[13px]" data-testid="transfers-table">
            <thead className="bg-surface">
              <tr>
                <th className={cn(TH, "text-left")}>Number</th>
                <th className={cn(TH, "text-left")}>Date</th>
                <th className={cn(TH, "text-left")}>From</th>
                <th className={cn(TH, "text-left")}>To</th>
                <th className={cn(TH, "text-right")}>Amount</th>
                <th className={cn(TH, "text-right")}>Bank charges</th>
                <th className={cn(TH, "text-left")}>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.transfers.map((t) => {
                const isVoid = t.status === "void";
                return (
                  <tr
                    key={t.id}
                    className={cn("border-t border-border transition-colors hover:bg-surface-2", isVoid && "text-muted")}
                  >
                    <td className={cn(TD, "whitespace-nowrap")}>
                      <Link href={`${base}/banking/transfers/${t.id}`} className="num font-medium text-ink hover:underline">
                        {t.number}
                      </Link>
                    </td>
                    <td className={cn(TD, "num whitespace-nowrap text-ink-2")}>{t.date}</td>
                    <td className={cn(TD, "text-ink-2")}>{t.fromAccountLabel}</td>
                    <td className={cn(TD, "text-ink-2")}>{t.toAccountLabel}</td>
                    <td className={cn(TD, "num-sans whitespace-nowrap text-right", isVoid ? "line-through" : "text-ink")}>
                      {rm(t.amountSen)}
                    </td>
                    <td className={cn(TD, "num-sans whitespace-nowrap text-right text-ink-2")}>
                      {t.feeSen > 0 ? rm(t.feeSen) : "–"}
                    </td>
                    <td className={cn(TD, "whitespace-nowrap")}>
                      <span className={isVoid ? "chip" : "chip pos"}>{isVoid ? "Void" : "Recorded"}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** /{slug}/banking/transfers/[id]: transfer details + Void control. */
export async function TransferDetailPage({ ctx, id }: { ctx: OrgContext; id: string }) {
  const supabase = await createSupabaseServerClient();
  const t = await loadTransferDetail(supabase, ctx.org.id, id);
  if (!t) notFound();
  const base = `/${ctx.org.slug}`;
  const canEdit = ctx.role !== "viewer";
  const isVoid = t.status === "void";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`${base}/banking/transfers`} className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-ink">
          <ArrowLeft size={13} aria-hidden="true" /> All transfers
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="m-0 flex flex-wrap items-center gap-2 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">
            <span className="num">{t.number}</span>
            <span className={isVoid ? "chip" : "chip pos"} data-testid="transfer-status">
              {isVoid ? "Void" : "Recorded"}
            </span>
          </h1>
          <div className="mt-1.5 text-[12.5px] text-muted">{ctx.org.legal_name} · Transfer details</div>
        </div>
      </div>

      <dl className="card m-0 grid grid-cols-1 gap-x-6 gap-y-4 p-5 text-[13px] sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="text-[11.5px] uppercase tracking-[0.06em] text-muted">From</dt>
          <dd className="m-0 mt-1 text-ink">{t.fromAccountLabel}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] uppercase tracking-[0.06em] text-muted">To</dt>
          <dd className="m-0 mt-1 text-ink">{t.toAccountLabel}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] uppercase tracking-[0.06em] text-muted">Date</dt>
          <dd className="num m-0 mt-1 text-ink">{t.date}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] uppercase tracking-[0.06em] text-muted">Amount</dt>
          <dd className="num-sans m-0 mt-1 font-semibold text-ink">{rm(t.amountSen)}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] uppercase tracking-[0.06em] text-muted">Bank charges</dt>
          <dd className="num-sans m-0 mt-1 text-ink">{t.feeSen > 0 ? rm(t.feeSen) : "RM0.00"}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] uppercase tracking-[0.06em] text-muted">Reference</dt>
          <dd className="m-0 mt-1 text-ink">{t.reference || "-"}</dd>
        </div>
        {t.journalEntryId && (
          <div>
            <dt className="text-[11.5px] uppercase tracking-[0.06em] text-muted">Ledger</dt>
            <dd className="m-0 mt-1">
              <Link href={`${base}/ledger/entries/${t.journalEntryId}`} className="font-medium text-brand hover:underline">
                View journal entry
              </Link>
            </dd>
          </div>
        )}
        {isVoid && (
          <div className="sm:col-span-2">
            <dt className="text-[11.5px] uppercase tracking-[0.06em] text-muted">Voided on {t.voidedOn}</dt>
            <dd className="m-0 mt-1 text-ink">
              Void reason: {t.voidReason}
              {t.voidEntryId && (
                <>
                  {" · "}
                  <Link href={`${base}/ledger/entries/${t.voidEntryId}`} className="font-medium text-brand hover:underline">
                    View reversal entry
                  </Link>
                </>
              )}
            </dd>
          </div>
        )}
      </dl>

      {canEdit && !isVoid && (
        <div>
          <VoidTransferControl orgSlug={ctx.org.slug} id={t.id} transferDate={t.date} today={todayMY()} />
        </div>
      )}
    </div>
  );
}
