import type { OrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { loadFxRevaluationPageData, loadWhtPageData } from "./load";
import { FxRevaluationClient, WhtClient } from "./wht-fx-client";

const STAT =
  "flex flex-col gap-2 px-4 py-3.5 max-sm:flex-row max-sm:items-baseline max-sm:justify-between";
const STAT_V = "num-sans text-[20px] font-semibold leading-none tracking-[-0.02em] text-ink";

function fmtRm(n: number) {
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function WhtPage({ ctx }: { ctx: OrgContext }) {
  const supabase = await createSupabaseServerClient();
  const data = await loadWhtPageData(supabase, ctx.org.id);
  const canEdit = ctx.role !== "viewer";

  return (
    <div className="flex flex-col gap-6">
      <div className="py-1">
        <h1 className="m-0 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">
          Withholding tax (WHT)
        </h1>
        <div className="mt-1.5 text-[12.5px] text-muted">
          {ctx.org.legal_name} · LHDN Form CP37, CP37A, CP37D &amp; CP107D · 30-day statutory remittance tracker
        </div>
      </div>

      <div className="card grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className={STAT}>
          <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Unremitted WHT payable</div>
          <div className={STAT_V}>{fmtRm(data.summary.unremittedTotal)}</div>
          <div className="text-[11.5px] text-muted">{data.summary.unremittedCount} open deductions (400-1100)</div>
        </div>
        <div className={STAT}>
          <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Overdue past 30 days</div>
          <div className={STAT_V}>{data.summary.overdueCount}</div>
          <div className="text-[11.5px] text-muted">LHDN 10% late-payment penalty risk</div>
        </div>
        <div className={STAT}>
          <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Total remitted to LHDN</div>
          <div className={STAT_V}>{fmtRm(data.summary.remittedTotal)}</div>
          <div className="text-[11.5px] text-muted">Settled &amp; reconciled</div>
        </div>
      </div>

      <WhtClient
        orgSlug={ctx.org.slug}
        rows={data.rows}
        expenseAccounts={data.expenseAccounts}
        bankAccounts={data.bankAccounts}
        latestRates={data.latestRates}
        canEdit={canEdit}
      />
    </div>
  );
}

export async function FxRevaluationPage({ ctx }: { ctx: OrgContext }) {
  const supabase = await createSupabaseServerClient();
  const data = await loadFxRevaluationPageData(supabase, ctx.org.id);
  const canEdit = ctx.role !== "viewer";

  return (
    <div className="flex flex-col gap-6">
      <div className="py-1">
        <h1 className="m-0 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">
          Foreign currency revaluation
        </h1>
        <div className="mt-1.5 text-[12.5px] text-muted">
          {ctx.org.legal_name} · Month-end MPERS Section 30 unrealised FX gain / loss adjustments
        </div>
      </div>

      <div className="card grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <div className={STAT}>
          <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Net active unrealised FX G/L</div>
          <div className={`${STAT_V} ${data.netUnrealised >= 0 ? "text-positive" : "text-negative"}`}>
            {data.netUnrealised >= 0 ? `+${fmtRm(data.netUnrealised)}` : `-${fmtRm(Math.abs(data.netUnrealised))}`}
          </div>
          <div className="text-[11.5px] text-muted">Posted &amp; unreversed adjustments</div>
        </div>
        <div className={STAT}>
          <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Saved FX currencies</div>
          <div className={STAT_V}>{Object.keys(data.latestRates).length}</div>
          <div className="text-[11.5px] text-muted">Synced from Settings → Exchange rates</div>
        </div>
      </div>

      <FxRevaluationClient
        orgSlug={ctx.org.slug}
        rows={data.rows}
        accounts={data.accounts}
        latestRates={data.latestRates}
        canEdit={canEdit}
      />
    </div>
  );
}
