import { ArrowLeft, CircleHelp } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { rm } from "@/features/books/money";
import type { OrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { cn } from "@/shared/ui/cn";
import { DisposeAssetControl, FixedAssetsControls } from "./fixed-assets-client";
import { loadFixedAssetDetail, loadFixedAssetsData } from "./load";
import type { AssetStatus } from "./types";

const TH = "border-b border-border px-[var(--pad-x)] py-2 text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted";
const TD = "h-[var(--row-h)] border-b border-border px-[var(--pad-x)] align-middle";
const STAT =
  "flex flex-col gap-2.5 px-4 py-4 max-sm:flex-row max-sm:flex-wrap max-sm:items-baseline max-sm:justify-between max-sm:gap-x-3 max-sm:gap-y-0.5 max-sm:px-3.5 max-sm:py-2.5";
const STAT_V =
  "num-sans text-[20px] font-semibold leading-none tracking-[-0.02em] text-ink max-sm:ml-auto max-sm:text-right";

const STATUS_CHIP: Record<AssetStatus, [string, string]> = {
  active: ["chip pos", "Active"],
  fully_depreciated: ["chip brand", "Fully depreciated"],
  disposed: ["chip", "Disposed"],
};

/** /{slug}/fixed-assets: Fixed assets register & monthly straight-line depreciation (lejar.ai help article). */
export async function FixedAssetsListPage({ ctx }: { ctx: OrgContext }) {
  const supabase = await createSupabaseServerClient();
  const data = await loadFixedAssetsData(supabase, ctx.org.id);
  const base = `/${ctx.org.slug}`;
  const canEdit = ctx.role !== "viewer";
  const ms = ctx.lang === "ms";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 py-1">
        <div className="min-w-0">
          <h1 className="m-0 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">
            {ms ? "Aset tetap" : "Fixed assets"}
          </h1>
          <div className="mt-1.5 text-[12.5px] text-muted">
            {ctx.org.legal_name} · register &amp; straight-line depreciation ·{" "}
            <span className="num text-ink">{data.assets.length}</span>{" "}
            {data.assets.length === 1 ? "asset" : "assets"}
          </div>
          <details className="mt-1.5 max-w-[620px]">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[12px] text-muted transition-colors hover:text-ink">
              <CircleHelp size={12} aria-hidden="true" />{" "}
              {ms ? "Ketahui tentang halaman ini" : "Learn about this page"}
            </summary>
            <div className="mt-2 flex flex-col gap-2 rounded-[var(--radius)] border border-border bg-surface px-3 py-2.5 text-[12.5px] leading-[1.6] text-ink-2">
              <p className="m-0">Track equipment and property, and spread their cost over time automatically.</p>
              <ul className="m-0 flex list-disc flex-col gap-1 pl-4">
                <li>Keep a register of each asset with its cost, start date and useful life.</li>
                <li>Post one balanced depreciation entry per month, without double-posting.</li>
                <li>Retire an asset automatically once it is fully depreciated, or dispose of it when sold or scrapped.</li>
              </ul>
            </div>
          </details>
        </div>
      </div>

      <div
        className="card grid grid-cols-1 divide-y divide-border p-0 sm:grid-cols-3 sm:divide-x sm:divide-y-0"
        data-testid="fa-stats"
      >
        <div className={STAT}>
          <div className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-muted">Total cost</div>
          <div className={STAT_V}>{rm(data.stats.totalCostSen)}</div>
          <div className="text-[11.5px] text-muted max-sm:order-last max-sm:w-full">
            {data.stats.activeCount} active · {data.stats.fullyDepCount} fully depreciated
          </div>
        </div>
        <div className={STAT}>
          <div className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-muted">Accumulated depreciation</div>
          <div className={STAT_V}>{rm(data.stats.totalAccumSen)}</div>
          <div className="text-[11.5px] text-muted max-sm:order-last max-sm:w-full">Straight-line to date</div>
        </div>
        <div className={STAT}>
          <div className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-muted">Net book value</div>
          <div className={STAT_V}>{rm(data.stats.totalNbvSen)}</div>
          <div className="text-[11.5px] text-muted max-sm:order-last max-sm:w-full">
            {data.stats.disposedCount > 0 ? `${data.stats.disposedCount} disposed excluded` : "Carrying amount"}
          </div>
        </div>
      </div>

      {canEdit && <FixedAssetsControls orgSlug={ctx.org.slug} today={data.today} accounts={data.accounts} />}

      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-[14px] font-semibold text-ink">Asset register</h2>
        {data.assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 rounded-[var(--radius-lg)] border border-dashed border-border py-10 text-center">
            <p className="m-0 text-[13.5px] font-medium text-ink">No fixed assets registered yet</p>
            <p className="m-0 text-[12.5px] text-muted">
              Register equipment, vehicles, or leasehold improvements above to track depreciation.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
            <table className="w-full border-collapse text-[13px]" data-testid="fa-table">
              <thead className="bg-surface">
                <tr>
                  <th className={cn(TH, "text-left")}>Code</th>
                  <th className={cn(TH, "text-left")}>Asset</th>
                  <th className={cn(TH, "text-left")}>Purchase date</th>
                  <th className={cn(TH, "text-right")}>Cost</th>
                  <th className={cn(TH, "text-right")}>Accum. dep.</th>
                  <th className={cn(TH, "text-right")}>Net book value</th>
                  <th className={cn(TH, "text-left")}>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.assets.map((a) => {
                  const [chip, label] = STATUS_CHIP[a.status];
                  return (
                    <tr
                      key={a.id}
                      className={cn(
                        "border-t border-border transition-colors hover:bg-surface-2",
                        a.status === "disposed" && "text-muted",
                      )}
                    >
                      <td className={cn(TD, "whitespace-nowrap")}>
                        <Link href={`${base}/fixed-assets/${a.id}`} className="num font-medium text-ink hover:underline">
                          {a.assetCode}
                        </Link>
                      </td>
                      <td className={cn(TD, "py-2")}>
                        <div className="font-medium text-ink">{a.name}</div>
                        <div className="text-[11.5px] text-muted">
                          {a.assetAccountLabel} · {a.usefulLifeMonths} mos
                        </div>
                      </td>
                      <td className={cn(TD, "num whitespace-nowrap text-ink-2")}>{a.purchaseDate}</td>
                      <td className={cn(TD, "num-sans whitespace-nowrap text-right text-ink")}>{rm(a.costSen)}</td>
                      <td className={cn(TD, "num-sans whitespace-nowrap text-right text-ink-2")}>{rm(a.accumDepSen)}</td>
                      <td className={cn(TD, "num-sans whitespace-nowrap text-right font-medium text-ink")}>
                        {a.status === "disposed" ? "–" : rm(a.nbvSen)}
                      </td>
                      <td className={cn(TD, "whitespace-nowrap")}>
                        <span className={chip}>{label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/** /{slug}/fixed-assets/[id]: single asset register card, depreciation runs, and disposal control. */
export async function FixedAssetDetailPage({ ctx, id }: { ctx: OrgContext; id: string }) {
  const supabase = await createSupabaseServerClient();
  const data = await loadFixedAssetDetail(supabase, ctx.org.id, id);
  if (!data) notFound();
  const { asset: a, runs, cashAccounts, today } = data;
  const base = `/${ctx.org.slug}`;
  const canEdit = ctx.role !== "viewer";
  const [chip, label] = STATUS_CHIP[a.status];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`${base}/fixed-assets`} className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-ink">
          <ArrowLeft size={13} aria-hidden="true" /> Fixed assets
        </Link>
      </div>

      <div>
        <h1 className="m-0 flex flex-wrap items-center gap-2 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">
          <span className="num">{a.assetCode}</span> · {a.name}
          <span className={chip} data-testid="fa-status">
            {label}
          </span>
        </h1>
        <div className="mt-1.5 text-[12.5px] text-muted">
          {ctx.org.legal_name} · {a.assetAccountLabel}
        </div>
      </div>

      <dl className="card m-0 grid grid-cols-2 gap-x-6 gap-y-4 p-5 text-[13px] sm:grid-cols-4">
        <div>
          <dt className="text-[11.5px] uppercase tracking-[0.06em] text-muted">Purchase date</dt>
          <dd className="num m-0 mt-1 text-ink">{a.purchaseDate}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] uppercase tracking-[0.06em] text-muted">Depreciate from</dt>
          <dd className="num m-0 mt-1 text-ink">{a.depreciationStart}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] uppercase tracking-[0.06em] text-muted">Useful life</dt>
          <dd className="m-0 mt-1 text-ink">{a.usefulLifeMonths} months (straight-line)</dd>
        </div>
        <div>
          <dt className="text-[11.5px] uppercase tracking-[0.06em] text-muted">Residual value</dt>
          <dd className="num-sans m-0 mt-1 text-ink">{rm(a.residualSen)}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] uppercase tracking-[0.06em] text-muted">Cost</dt>
          <dd className="num-sans m-0 mt-1 font-semibold text-ink">{rm(a.costSen)}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] uppercase tracking-[0.06em] text-muted">Accumulated depreciation</dt>
          <dd className="num-sans m-0 mt-1 text-ink">{rm(a.accumDepSen)}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] uppercase tracking-[0.06em] text-muted">Net book value</dt>
          <dd className="num-sans m-0 mt-1 font-semibold text-ink">{a.status === "disposed" ? "RM0.00" : rm(a.nbvSen)}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] uppercase tracking-[0.06em] text-muted">Expense account</dt>
          <dd className="m-0 mt-1 text-ink-2">{a.depExpenseAccountLabel}</dd>
        </div>
        {a.status === "disposed" && (
          <div className="col-span-2 sm:col-span-4">
            <dt className="text-[11.5px] uppercase tracking-[0.06em] text-muted">Disposed</dt>
            <dd className="m-0 mt-1 text-ink">
              Disposed on <span className="num">{a.disposedOn}</span> · Proceeds{" "}
              <span className="num-sans font-medium">{rm(a.disposalProceedsSen ?? 0)}</span>
              {a.disposalEntryId && (
                <>
                  {" · "}
                  <Link href={`${base}/ledger/entries/${a.disposalEntryId}`} className="font-medium text-brand hover:underline">
                    View disposal entry
                  </Link>
                </>
              )}
            </dd>
          </div>
        )}
      </dl>

      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-[14px] font-semibold text-ink">Depreciation posted ({runs.length})</h2>
        {runs.length === 0 ? (
          <p className="m-0 text-[13px] text-muted">No depreciation posted for this asset yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
            <table className="w-full border-collapse text-[13px]" data-testid="fa-runs">
              <thead className="bg-surface">
                <tr>
                  <th className={cn(TH, "text-left")}>Month</th>
                  <th className={cn(TH, "text-left")}>Posted on</th>
                  <th className={cn(TH, "text-right")}>Amount</th>
                  <th className={cn(TH, "text-right")}>Ledger</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-border transition-colors hover:bg-surface-2">
                    <td className={cn(TD, "num text-ink")}>{r.periodMonth.slice(0, 7)}</td>
                    <td className={cn(TD, "num text-ink-2")}>{r.postedOn}</td>
                    <td className={cn(TD, "num-sans text-right text-ink")}>{rm(r.amountSen)}</td>
                    <td className={cn(TD, "text-right")}>
                      <Link href={`${base}/ledger/entries/${r.journalEntryId}`} className="font-medium text-brand hover:underline">
                        View entry
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canEdit && a.status !== "disposed" && (
        <div>
          <DisposeAssetControl
            orgSlug={ctx.org.slug}
            id={a.id}
            purchaseDate={a.purchaseDate}
            today={today}
            cashAccounts={cashAccounts}
          />
        </div>
      )}
    </div>
  );
}
