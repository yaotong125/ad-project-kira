import { ArrowLeft, CircleHelp } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { rm } from "@/features/books/money";
import type { OrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { cn } from "@/shared/ui/cn";
import { loadPrepaidDetail, loadPrepaidsData } from "./load";
import { CancelPrepaidButton, PostPrepaidLineButton, PrepaidsControls } from "./prepaids-client";
import type { PrepaidLineStatus, PrepaidStatus } from "./types";

const TH = "border-b border-border px-[var(--pad-x)] py-2 text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted";
const TD = "h-[var(--row-h)] border-b border-border px-[var(--pad-x)] align-middle";
const STAT =
  "flex flex-col gap-2.5 px-4 py-4 max-sm:flex-row max-sm:flex-wrap max-sm:items-baseline max-sm:justify-between max-sm:gap-x-3 max-sm:gap-y-0.5 max-sm:px-3.5 max-sm:py-2.5";
const STAT_V =
  "num-sans text-[20px] font-semibold leading-none tracking-[-0.02em] text-ink max-sm:ml-auto max-sm:text-right";

const SCHED_CHIP: Record<PrepaidStatus, [string, string]> = {
  active: ["chip pos", "Active"],
  completed: ["chip brand", "Completed"],
  cancelled: ["chip", "Cancelled"],
};

const LINE_CHIP: Record<PrepaidLineStatus, [string, string]> = {
  pending: ["chip", "Pending"],
  posted: ["chip pos", "Posted"],
  cancelled: ["chip", "Cancelled"],
};

/** /{slug}/prepaid-amortisations: Prepaid amortisation schedules (lejar.ai help article). */
export async function PrepaidsListPage({ ctx }: { ctx: OrgContext }) {
  const supabase = await createSupabaseServerClient();
  const data = await loadPrepaidsData(supabase, ctx.org.id);
  const base = `/${ctx.org.slug}`;
  const canEdit = ctx.role !== "viewer";
  const ms = ctx.lang === "ms";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 py-1">
        <div className="min-w-0">
          <h1 className="m-0 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">
            {ms ? "Pelunasan prabayar" : "Prepaid amortisation"}
          </h1>
          <div className="mt-1.5 text-[12.5px] text-muted">
            {ctx.org.legal_name} · spread upfront costs across months ·{" "}
            <span className="num text-ink">{data.schedules.length}</span>{" "}
            {data.schedules.length === 1 ? "schedule" : "schedules"}
          </div>
          <details className="mt-1.5 max-w-[620px]">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[12px] text-muted transition-colors hover:text-ink">
              <CircleHelp size={12} aria-hidden="true" />{" "}
              {ms ? "Ketahui tentang halaman ini" : "Learn about this page"}
            </summary>
            <div className="mt-2 flex flex-col gap-2 rounded-[var(--radius)] border border-border bg-surface px-3 py-2.5 text-[12.5px] leading-[1.6] text-ink-2">
              <p className="m-0">
                When you pay for something upfront that covers many months, like annual insurance, a prepaid
                amortisation schedule spreads that cost evenly across the months it covers instead of loading it all
                into the month you paid.
              </p>
              <ul className="m-0 flex list-disc flex-col gap-1 pl-4">
                <li>
                  Record the upfront payment itself as a bill or payment voucher into your Prepayments asset account
                  (300-0500).
                </li>
                <li>
                  Each period posts an equal journal entry debiting the expense account and crediting Prepayments; the
                  final period absorbs any rounding so the total matches exactly.
                </li>
                <li>Turn auto-post on for batch posting, or leave it off to confirm and post each period yourself.</li>
              </ul>
            </div>
          </details>
        </div>
      </div>

      <div
        className="card grid grid-cols-1 divide-y divide-border p-0 sm:grid-cols-3 sm:divide-x sm:divide-y-0"
        data-testid="prepaid-stats"
      >
        <div className={STAT}>
          <div className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-muted">Total prepaid</div>
          <div className={STAT_V}>{rm(data.stats.totalSen)}</div>
          <div className="text-[11.5px] text-muted max-sm:order-last max-sm:w-full">
            {data.stats.activeCount} active
          </div>
        </div>
        <div className={STAT}>
          <div className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-muted">Amortised to date</div>
          <div className={STAT_V}>{rm(data.stats.amortisedSen)}</div>
          <div className="text-[11.5px] text-muted max-sm:order-last max-sm:w-full">Posted to expense</div>
        </div>
        <div className={STAT}>
          <div className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-muted">Remaining balance</div>
          <div className={STAT_V}>{rm(data.stats.remainingSen)}</div>
          <div className="text-[11.5px] text-muted max-sm:order-last max-sm:w-full">Unamortised prepaid</div>
        </div>
      </div>

      {canEdit && <PrepaidsControls orgSlug={ctx.org.slug} today={data.today} accounts={data.accounts} />}

      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-[14px] font-semibold text-ink">Schedules</h2>
        {data.schedules.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 rounded-[var(--radius-lg)] border border-dashed border-border py-10 text-center">
            <p className="m-0 text-[13.5px] font-medium text-ink">No prepaid schedules yet</p>
            <p className="m-0 text-[12.5px] text-muted">
              Set up a schedule above to spread annual insurance, rent, or subscriptions across months.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
            <table className="w-full border-collapse text-[13px]" data-testid="prepaid-table">
              <thead className="bg-surface">
                <tr>
                  <th className={cn(TH, "text-left")}>Schedule</th>
                  <th className={cn(TH, "text-left")}>Periods</th>
                  <th className={cn(TH, "text-right")}>Total</th>
                  <th className={cn(TH, "text-right")}>Remaining</th>
                  <th className={cn(TH, "text-left")}>Posting</th>
                  <th className={cn(TH, "text-left")}>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.schedules.map((s) => {
                  const [chip, label] = SCHED_CHIP[s.status];
                  return (
                    <tr key={s.id} className="border-t border-border transition-colors hover:bg-surface-2">
                      <td className={cn(TD, "py-2")}>
                        <Link href={`${base}/prepaid-amortisations/${s.id}`} className="font-medium text-ink hover:underline">
                          {s.name}
                        </Link>
                        <div className="text-[11.5px] text-muted">
                          {s.prepaidAccountLabel} → {s.expenseAccountLabel}
                        </div>
                      </td>
                      <td className={cn(TD, "num whitespace-nowrap text-ink-2")}>
                        {s.postedCount} / {s.periodsCount}
                      </td>
                      <td className={cn(TD, "num-sans whitespace-nowrap text-right text-ink")}>{rm(s.totalSen)}</td>
                      <td className={cn(TD, "num-sans whitespace-nowrap text-right font-medium text-ink")}>
                        {rm(s.remainingSen)}
                      </td>
                      <td className={cn(TD, "whitespace-nowrap")}>
                        <span className={s.autoPost ? "chip brand" : "chip"}>
                          {s.autoPost ? "Auto-post" : "Manual"}
                        </span>
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

/** /{slug}/prepaid-amortisations/[id]: schedule detail with period-by-period Post buttons. */
export async function PrepaidDetailPage({ ctx, id }: { ctx: OrgContext; id: string }) {
  const supabase = await createSupabaseServerClient();
  const data = await loadPrepaidDetail(supabase, ctx.org.id, id);
  if (!data) notFound();
  const { schedule: s, lines } = data;
  const base = `/${ctx.org.slug}`;
  const canEdit = ctx.role !== "viewer";
  const [chip, label] = SCHED_CHIP[s.status];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`${base}/prepaid-amortisations`} className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-ink">
          <ArrowLeft size={13} aria-hidden="true" /> Prepaid amortisation
        </Link>
      </div>

      <div>
        <h1 className="m-0 flex flex-wrap items-center gap-2 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">
          {s.name}
          <span className={chip} data-testid="prepaid-status">
            {label}
          </span>
        </h1>
        <div className="mt-1.5 text-[12.5px] text-muted">
          {ctx.org.legal_name} · {s.prepaidAccountLabel} → {s.expenseAccountLabel}
        </div>
      </div>

      <dl className="card m-0 grid grid-cols-2 gap-x-6 gap-y-4 p-5 text-[13px] sm:grid-cols-4">
        <div>
          <dt className="text-[11.5px] uppercase tracking-[0.06em] text-muted">Total prepaid</dt>
          <dd className="num-sans m-0 mt-1 font-semibold text-ink">{rm(s.totalSen)}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] uppercase tracking-[0.06em] text-muted">Amortised</dt>
          <dd className="num-sans m-0 mt-1 text-ink">{rm(s.amortisedSen)}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] uppercase tracking-[0.06em] text-muted">Remaining</dt>
          <dd className="num-sans m-0 mt-1 font-semibold text-ink">{rm(s.remainingSen)}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] uppercase tracking-[0.06em] text-muted">Progress</dt>
          <dd className="num m-0 mt-1 text-ink">
            {s.postedCount} / {s.periodsCount} periods ({s.autoPost ? "Auto-post" : "Manual"})
          </dd>
        </div>
      </dl>

      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-[14px] font-semibold text-ink">Amortisation schedule</h2>
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
          <table className="w-full border-collapse text-[13px]" data-testid="prepaid-lines">
            <thead className="bg-surface">
              <tr>
                <th className={cn(TH, "text-left")}>Period</th>
                <th className={cn(TH, "text-left")}>Scheduled date</th>
                <th className={cn(TH, "text-right")}>Amount</th>
                <th className={cn(TH, "text-left")}>Status</th>
                <th className={cn(TH, "text-right")}>Action</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const [lChip, lLabel] = LINE_CHIP[l.status];
                return (
                  <tr key={l.id} className="border-t border-border transition-colors hover:bg-surface-2">
                    <td className={cn(TD, "num text-ink-2")}>
                      {l.periodNo} / {s.periodsCount}
                    </td>
                    <td className={cn(TD, "num text-ink")}>{l.scheduledOn}</td>
                    <td className={cn(TD, "num-sans text-right text-ink")}>{rm(l.amountSen)}</td>
                    <td className={TD}>
                      <span className={lChip}>{lLabel}</span>
                    </td>
                    <td className={cn(TD, "text-right")}>
                      {l.journalEntryId ? (
                        <Link href={`${base}/ledger/entries/${l.journalEntryId}`} className="font-medium text-brand hover:underline">
                          View entry
                        </Link>
                      ) : canEdit && s.status === "active" && l.status === "pending" ? (
                        <PostPrepaidLineButton orgSlug={ctx.org.slug} scheduleId={s.id} lineId={l.id} />
                      ) : (
                        <span className="text-muted">–</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {canEdit && s.status === "active" && <CancelPrepaidButton orgSlug={ctx.org.slug} id={s.id} />}
    </div>
  );
}
