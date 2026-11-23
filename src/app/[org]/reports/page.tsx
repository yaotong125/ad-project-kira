import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { rm } from "@/features/books/money";
import { CsvButton } from "@/features/reports/csv-button";
import type { Block } from "@/features/reports/engine";
import { flattenBs, flattenCf, flattenPnl, toCsv } from "@/features/reports/flatten";
import { dmy, reportContext } from "@/features/reports/params";
import { first, type SearchParams } from "@/shared/i18n";
import { loadOrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { buttonClass } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";
import { Input, Select } from "@/shared/ui/form-controls";
import { PageHeader } from "@/shared/ui/page-header";

/** Rendered per request (session, entity). */
export const instant = false;

export const metadata: Metadata = { title: "Reports", robots: { index: false } };

const H3 = "text-[11.5px] font-medium uppercase tracking-[0.06em] text-muted";
const EMPTY = "rounded-[var(--radius)] border border-dashed border-border px-3 py-2 text-[12.5px] text-muted";

function Section({ b, compare }: { b: Block; compare: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className={H3}>{b.title}</h3>
      {b.rows.length === 0 ? (
        <p className={EMPTY}>No activity in this period.</p>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-surface">
          {b.rows.map((r) => (
            <div key={`${r.code}-${r.name}`} className="flex items-center justify-between gap-4 border-b border-border px-3 py-1.5 text-[13px] last:border-b-0">
              <span className="text-ink-2">
                {r.code && <span className="num mr-2 text-muted">{r.code}</span>}
                {r.name}
              </span>
              <span className="flex gap-6">
                <span className="num-sans min-w-[110px] text-right text-ink">{rm(r.amount)}</span>
                {compare && <span className="num-sans min-w-[110px] text-right text-muted">{rm(r.compare ?? 0)}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Total({ label, amount, compare, strong }: { label: string; amount: number; compare?: number; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between font-semibold text-ink", strong ? "border-t-2 border-border-strong pt-2.5 text-[14px]" : "border-t border-border-strong pt-2 text-[13.5px]")}>
      <span>{label}</span>
      <span className="flex gap-6">
        <span className="num-sans min-w-[110px] text-right">{rm(amount)}</span>
        {compare !== undefined && <span className="num-sans min-w-[110px] text-right text-muted">{rm(compare)}</span>}
      </span>
    </div>
  );
}

function Head({ id, title, sub, csv, csvName, pdf, flow }: { id: string; title: string; sub: string; csv: string; csvName: string; pdf: string; flow?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3" data-flow={flow}>
      <h2 className="text-[13.5px] font-semibold text-ink" id={`${id}-title`}>
        {title} <span className="text-[12.5px] font-normal text-muted">{sub}</span>
      </h2>
      <div className="flex items-center gap-2">
        <CsvButton csv={csv} fileName={csvName} />
        <a href={pdf} className={buttonClass("secondary")}>
          Download PDF
        </a>
      </div>
    </div>
  );
}

/**
 * /{slug}/reports: lejar.ai's Reports page (observed 2026-11-22): year-end pack, jump links, the
 * P&L / balance sheet / compare form (GET), insights, then Profit & loss, Balance sheet and Cash flow,
 * each with CSV and PDF downloads. Viewing a P&L with activity checks Learn section 7 (inferred).
 */
export default async function Page({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<SearchParams> }) {
  const [{ org }, sp] = await Promise.all([params, searchParams]);
  const ctx = await loadOrgContext(org);
  const supabase = await createSupabaseServerClient();
  const r = await reportContext(supabase, org, { from: first(sp.from), to: first(sp.to), asOf: first(sp.asOf), compare: first(sp.compare) });
  if (!r) notFound();
  const base = `/${ctx.org.slug}`;
  const pnl = r.ledger.profitAndLoss(r.from, r.to, r.range ?? undefined);
  const bs = r.ledger.balanceSheet(r.asOf);
  const cf = r.ledger.cashFlow(r.from, r.to);
  const cmp = Boolean(r.range);
  if (pnl.hasActivity) await supabase.rpc("check_learn_section", { p_org: ctx.org.id, p_section: "read-pnl" });

  const insights: string[] = [];
  if (pnl.hasActivity) {
    const income = pnl.sales.total + pnl.other.total;
    if (pnl.sales.total > 0) insights.push(`Gross margin is ${((pnl.gross / pnl.sales.total) * 100).toFixed(1)}% of sales.`);
    const biggest = [...pnl.cogs.rows, ...pnl.expenses.rows].sort((a, b) => b.amount - a.amount)[0];
    if (biggest) insights.push(`The largest cost is ${biggest.name}: ${rm(biggest.amount)}${income > 0 ? `, ${((biggest.amount / income) * 100).toFixed(1)}% of income` : ""}.`);
    if (pnl.compare) {
      const d = pnl.net - pnl.compare.net;
      insights.push(`Net profit is ${d >= 0 ? "up" : "down"} ${rm(Math.abs(d))} on the comparison period (${rm(pnl.compare.net)} then).`);
    }
  }
  const compareLabel = r.range ? `${dmy(r.range.from)} → ${dmy(r.range.to)}` : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reports"
        sub={
          <>
            {ctx.org.legal_name} · MPERS-aligned{r.fy ? ` · FY ${r.fy.starts_on} → ${r.fy.ends_on}` : ""}
          </>
        }
        actions={
          <a href={`${base}/reports/year-end-pack?asOf=${r.asOf}`} className={buttonClass("primary")}>
            Download year-end pack
          </a>
        }
      />
      <div className="flex flex-wrap gap-2">
        {[
          ["#profit-and-loss", "Profit & loss"],
          ["#balance-sheet", "Balance sheet"],
          ["#cash-flow", "Cash flow"],
        ].map(([h, l]) => (
          <a key={h} href={h} className={buttonClass("secondary", "sm")}>
            {l}
          </a>
        ))}
      </div>

      <form method="get" action={`${base}/reports`} className="card flex flex-wrap items-end gap-3 p-4">
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
          P&L from
          <Input type="date" name="from" defaultValue={r.from} />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
          P&L to
          <Input type="date" name="to" defaultValue={r.to} />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
          Balance sheet as of
          <Input type="date" name="asOf" defaultValue={r.asOf} />
        </label>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="compare" className="text-[13px] font-medium text-ink-2">
            Compare P&L to
          </label>
          <Select id="compare" name="compare" defaultValue={r.compare} className="min-w-[260px]">
            <option value="none">None</option>
            <option value="prior_period">Prior period</option>
            <option value="last_year" disabled={!r.lastYearAvailable}>
              Same period last year{r.lastYearAvailable ? "" : " (unavailable)"}
            </option>
          </Select>
          {!r.lastYearAvailable && <p className="m-0 text-[13px] text-muted">There is no matching period in the prior financial year.</p>}
          {r.compare !== "none" && !r.range && <p className="m-0 text-[13px] text-negative">That comparison is before your books start.</p>}
        </div>
        <button type="submit" className={buttonClass("primary")}>
          Recompute
        </button>
      </form>

      <section className="flex flex-col gap-2">
        <h2 className="text-[13.5px] font-semibold text-ink">Insights</h2>
        {insights.length === 0 ? (
          <p className={EMPTY}>Insights are pending data. They appear once this period has activity to compare.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {insights.map((i) => (
              <li key={i} className="rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-[13px] text-ink-2">
                {i}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="profit-and-loss" data-flow="pnl-report" tabIndex={-1} className="flex scroll-mt-4 flex-col gap-4">
        <Head
          id="pnl"
          title="Profit & loss"
          sub={`${dmy(r.from)} → ${dmy(r.to)}`}
          csv={toCsv(`Profit & loss ${r.from} to ${r.to}`, flattenPnl(pnl), compareLabel)}
          csvName={`profit-and-loss-${r.from}-${r.to}.csv`}
          pdf={`${base}/reports/profit-and-loss/pdf?from=${r.from}&to=${r.to}&compare=${r.compare}`}
        />
        {cmp && (
          <div className="flex justify-end gap-6 text-[11.5px] font-medium uppercase tracking-[0.06em] text-muted">
            <span className="min-w-[110px] text-right">This period</span>
            <span className="min-w-[110px] text-right">{compareLabel}</span>
          </div>
        )}
        <Section b={pnl.sales} compare={cmp} />
        <Section b={pnl.cogs} compare={cmp} />
        <Total label="Gross profit / (loss)" amount={pnl.gross} compare={pnl.compare?.gross} />
        <Section b={pnl.other} compare={cmp} />
        <Section b={pnl.expenses} compare={cmp} />
        <Total label="Net profit / (loss)" amount={pnl.net} compare={pnl.compare?.net} strong />
      </section>

      <section id="balance-sheet" tabIndex={-1} className="flex scroll-mt-4 flex-col gap-4">
        <Head id="bs" title="Balance sheet" sub={`as of ${dmy(r.asOf)} · net assets / financed by`} csv={toCsv(`Balance sheet as of ${r.asOf}`, flattenBs(bs))} csvName={`balance-sheet-${r.asOf}.csv`} pdf={`${base}/reports/balance-sheet/pdf?asOf=${r.asOf}`} />
        <Section b={bs.fixed} compare={false} />
        <Section b={bs.current} compare={false} />
        <Section b={bs.liabilities} compare={false} />
        <Total label="Net current assets" amount={bs.netCurrent} />
        <Total label="Net assets" amount={bs.netAssets} strong />
        <h3 className="mt-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink">Financed by</h3>
        <p className="-mt-1.5 max-w-prose text-[12px] leading-[1.5] text-muted">
          Where the money funding the business comes from: owners&apos; capital, profits kept in the business, and any long-term borrowing. It equals net assets when the books balance.
        </p>
        <Section b={bs.capital} compare={false} />
        <Section b={bs.retained} compare={false} />
        <Section b={bs.longTerm} compare={false} />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-border-strong pt-2.5 text-[14px] font-semibold text-ink">
          <span className="num-sans">Financed by {rm(bs.financedBy)}</span>
          <span className={bs.balanced ? "chip pos" : "chip neg"}>{bs.balanced ? "Balanced" : `Out by ${rm(bs.netAssets - bs.financedBy)}`}</span>
        </div>
      </section>

      <section id="cash-flow" tabIndex={-1} className="flex scroll-mt-4 flex-col gap-4">
        <Head id="cf" title="Cash flow" sub={`${dmy(r.from)} → ${dmy(r.to)} · direct method`} csv={toCsv(`Cash flow ${r.from} to ${r.to}`, flattenCf(cf))} csvName={`cash-flow-${r.from}-${r.to}.csv`} pdf={`${base}/reports/cash-flow/pdf?from=${r.from}&to=${r.to}`} />
        {[cf.operating, cf.investing, cf.financing].map((b) =>
          b.rows.length === 0 ? (
            <p key={b.title} className="m-0 text-[13px] text-muted">
              <span className="font-medium text-ink-2">{b.title}</span>: no activity.
            </p>
          ) : (
            <Section key={b.title} b={b} compare={false} />
          ),
        )}
        <Total label="Net change in cash" amount={cf.change} />
        <div className="flex justify-between text-[13px] text-ink-2">
          <span>Opening cash</span>
          <span className="num-sans min-w-[110px] text-right">{rm(cf.opening)}</span>
        </div>
        <Total label="Closing cash" amount={cf.closing} strong />
        <p className="m-0 text-[12px] text-muted">
          Detail by line: <Link className="underline" href={`${base}/reports/general-ledger`}>General ledger</Link>
        </p>
      </section>
    </div>
  );
}
