import { ArrowDownRight, ArrowUpRight, ChevronRight, CircleHelp, GraduationCap, Inbox, Settings, ShieldCheck, Receipt } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { fromSen, rm } from "@/features/books/money";
import { StartSectionLink } from "@/features/learn/learn-buttons";
import { lt } from "@/features/learn/sections";
import type { OrgContext } from "@/shared/org-context";
import { buttonClass } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";
import { CashflowChart } from "./cashflow-chart";
import { dt, dtn } from "./copy";
import { HideSetupButton } from "./hide-setup-button";
import type { Dashboard, OpenItem } from "./load";

/** lejar.ai's link button inside dashboard cards (copied class list). */
const LINK = "inline-flex h-[30px] items-center gap-1 rounded-[var(--radius)] px-3 text-[12.5px] font-medium text-ink transition-colors hover:bg-surface-2 pointer-coarse:min-h-11";
const H2 = "m-0 text-[13.5px] font-semibold tracking-[-0.01em] text-ink";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

function hourMY() {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Kuala_Lumpur" }).format(new Date()));
}

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** A row card like lejar.ai's AI Inbox / Learn / e-Invoice strips. */
function Strip({ testid, icon, tone, title, note, sub, action }: { testid: string; icon: ReactNode; tone: string; title: string; note?: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3" data-testid={testid}>
      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", tone)} aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0 flex-1 basis-48">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[13px] font-medium text-ink">{title}</span>
          {note && <span className="text-[12.5px] text-muted">{note}</span>}
        </div>
        {sub && <div className="mt-0.5 text-[12px] leading-[1.5] text-muted">{sub}</div>}
      </div>
      {action && <span className="-mr-2 shrink-0">{action}</span>}
    </div>
  );
}

function Money({ sen, size = "20px" }: { sen: number; size?: string }) {
  return (
    <>
      <span className="mr-0.5 text-[12px] font-medium text-muted">{sen < 0 ? "-RM" : "RM"}</span>
      <span style={{ fontSize: size }}>{fromSen(Math.abs(sen))}</span>
    </>
  );
}

export function DashboardPage({ ctx, d }: { ctx: OrgContext; d: Dashboard }) {
  const { lang } = ctx;
  const t = (k: Parameters<typeof dt>[1], v?: Record<string, string | number>) => dt(lang, k, v);
  const base = `/${ctx.org.slug}`;
  const canEdit = ctx.role !== "viewer";
  const h = hourMY();
  const tod = h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
  const period = new Date(`${d.month.from}T00:00:00Z`).toLocaleDateString(lang === "ms" ? "ms-MY" : "en-MY", { month: "short", year: "numeric", timeZone: "UTC" });
  const inboxBusy = d.inbox.pending + d.inbox.waiting + d.inbox.failed > 0;
  const { now, last } = d.kpi;

  const delta = (cur: number, prev: number, higherIsGood: boolean): ReactNode => {
    if (!now.active) return t("dashboard.kpi.hint.emptyMonth");
    if (prev === 0) return t("dashboard.kpi.hint.noBaseline");
    const pct = Math.round(((cur - prev) / Math.abs(prev)) * 100);
    if (pct === 0) return `${t("dashboard.delta.noChange")} ${t("dashboard.kpi.hint.vsLastMonth")}`;
    const good = pct > 0 === higherIsGood;
    const Icon = pct > 0 ? ArrowUpRight : ArrowDownRight;
    return (
      <>
        <Icon size={13} aria-hidden="true" className={good ? "text-positive" : "text-negative"} />
        <span className="sr-only">{pct > 0 ? t("dashboard.delta.up") : t("dashboard.delta.down")} </span>
        <span className={good ? "text-positive" : "text-negative"}>{Math.abs(pct)}%</span> {t("dashboard.kpi.hint.vsLastMonth")}
      </>
    );
  };
  const netHint = !now.active ? t("dashboard.kpi.hint.emptyMonth") : now.revenue <= 0 ? t("dashboard.kpi.hint.noRevenue") : t("dashboard.kpi.hint.margin", { pct: Math.round((now.net / now.revenue) * 100) });

  const openCard = (kind: "in" | "out", items: OpenItem[]) => {
    const total = items.reduce((s, i) => s + i.owed, 0);
    const shown = items.slice(0, 3);
    const IN = kind === "in";
    const docPath = (i: OpenItem) => (IN ? `${base}/invoices/${i.id}` : `${base}/payments-made?bill=${i.id}`);
    return (
      <div className="card flex flex-col p-0">
        <div className="px-4 pb-3 pt-3.5">
          <h2 className="m-0 text-[11.5px] font-medium uppercase tracking-[0.07em] text-muted">{IN ? t("dashboard.owedToYou.title") : t("dashboard.youOwe.title")}</h2>
          <div className="num-sans mt-2.5 text-[20px] font-semibold leading-none tracking-[-0.02em] text-ink">{rm(total)}</div>
        </div>
        <div className="flex-1 border-t border-border">
          {items.length === 0 ? (
            <p className="m-0 px-4 py-4 text-[12.5px] text-muted">{IN ? t("dashboard.owedToYou.empty") : t("dashboard.youOwe.empty")}</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {shown.map((i) => {
                const late = i.dueDate && i.dueDate < d.today ? daysBetween(i.dueDate, d.today) : 0;
                return (
                  <li key={i.id} className="border-b border-border last:border-b-0">
                    <Link href={docPath(i)} className="flex items-center gap-3 px-4 py-[9px] transition-colors hover:bg-surface-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] font-medium text-ink">{i.party || i.number}</div>
                        <div className="mt-px text-[11.5px] text-muted">
                          <span className="num">{i.number}</span> ·{" "}
                          {late > 0 ? (
                            <span className="text-negative">{lang === "ms" ? `lewat ${late} hari` : `${late} ${late === 1 ? "day" : "days"} overdue`}</span>
                          ) : i.dueDate ? (
                            lang === "ms" ? `perlu dibayar ${i.dueDate}` : `due ${i.dueDate}`
                          ) : lang === "ms" ? (
                            "tiada tarikh akhir"
                          ) : (
                            "no due date"
                          )}
                        </div>
                      </div>
                      <div className="num-sans text-right text-[13px] font-semibold text-ink">{rm(i.owed)}</div>
                    </Link>
                  </li>
                );
              })}
              {items.length > shown.length && <li className="px-4 py-2 text-[11.5px] text-muted">{t("dashboard.balances.more", { count: items.length - shown.length })}</li>}
            </ul>
          )}
        </div>
        {canEdit && (
          <div className="p-4 pt-0">
            <Link
              href={items.length === 0 ? (IN ? `${base}/invoices?new=1` : `${base}/inbox`) : IN ? `${base}/payments-received?new=1` : `${base}/payments-made?new=1`}
              className={buttonClass("secondary", "default", "w-full")}
            >
              {items.length === 0
                ? IN
                  ? t("dashboard.owedToYou.emptyAction")
                  : t("dashboard.youOwe.emptyAction")
                : IN
                  ? lang === "ms"
                    ? "Rekod resit"
                    : "Record a receipt"
                  : t("dashboard.youOwe.action")}
            </Link>
          </div>
        )}
      </div>
    );
  };

  const SOURCE: Record<string, [string, string]> = {
    invoice: ["Invoice", "Invois"],
    bill: ["Bill", "Bil"],
    receipt: ["Receipt", "Resit"],
    payment: ["Payment", "Bayaran"],
    bank: ["Bank import", "Import bank"],
    manual: ["Journal", "Jurnal"],
    void: ["Void", "Batal"],
  };
  const feedHref = (r: Dashboard["feed"][number]) =>
    r.source === "invoice" && r.sourceId
      ? `${base}/invoices/${r.sourceId}`
      : r.source === "receipt"
        ? `${base}/payments-received`
        : r.source === "payment"
          ? `${base}/payments-made`
          : r.source === "bill"
            ? `${base}/bills`
            : r.source === "bank"
              ? `${base}/import`
              : `${base}/journal-entries`;

  return (
    <div className="pb-9">
      <div className="flex flex-col items-start gap-3 py-1 sm:flex-row sm:items-end sm:justify-between sm:gap-6" data-testid="dashboard-header">
        <div className="min-w-0">
          <h1 className="m-0 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">
            {t(inboxBusy ? "dashboard.headline.asOf" : "dashboard.headline.caughtUp", { timeOfDay: t(`dashboard.timeOfDay.${tod}`) })}
          </h1>
          <div className="mt-2 text-[12.5px] text-muted">
            {t(`dashboard.greeting.${tod}`)}
            {ctx.name ? `, ${ctx.name}` : ""} · {t("dashboard.sub", { org: ctx.org.legal_name, period })}
          </div>
          <details className="group mt-2 max-w-[560px]">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[12px] text-muted transition-colors hover:text-ink">
              <CircleHelp size={13} aria-hidden="true" /> {lang === "ms" ? "Ketahui tentang halaman ini" : "Learn about this page"}
            </summary>
            {/* lejar.ai help article "dashboard", Lejar → Kira */}
            <div className="mt-2 rounded-[var(--radius)] border border-border bg-surface px-3 py-2.5 text-[12.5px] leading-[1.6] text-ink-2">
              <ul className="m-0 flex list-disc flex-col gap-1 pl-4">
                <li>Cash on hand: the balance across your bank and cash accounts.</li>
                <li>Revenue and expenses: totals for the reporting period shown at the top.</li>
                <li>Receivables: money customers still owe you, from unpaid invoices.</li>
                <li>Payables: money you still owe suppliers, from unpaid bills.</li>
              </ul>
              <p className="m-0 mt-2 text-muted">
                If a card looks empty, it usually means nothing is posted yet, not that something is broken. Press Ctrl+J to open Ask Kira and ask about any figure. It answers from these same numbers.
              </p>
            </div>
          </details>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className={LINK} href={`${base}/ledger`}>
            {t("dashboard.action.reviewActivity")}
          </Link>
        </div>
      </div>

      <div className="mt-[18px] flex flex-col gap-2.5">
        {inboxBusy && (
          <Strip
            testid="dashboard-inbox"
            icon={<Inbox size={16} />}
            tone="bg-ai-soft text-ai"
            title="AI Inbox"
            note={[
              d.inbox.pending > 0 && dtn(lang, "dashboard.inbox.pending", d.inbox.pending),
              d.inbox.waiting > 0 && dtn(lang, "dashboard.inbox.waiting", d.inbox.waiting),
              d.inbox.failed > 0 && dtn(lang, "dashboard.inbox.failed", d.inbox.failed),
            ]
              .filter(Boolean)
              .join(" · ")}
            action={
              <Link className={LINK} href={`${base}/inbox`}>
                {d.inbox.pending > 0 ? t("dashboard.inbox.review") : t("dashboard.inbox.open")} <ChevronRight size={14} aria-hidden="true" />
              </Link>
            }
          />
        )}
        {d.learnCard && (
          <Strip
            testid="dashboard-learn"
            icon={<GraduationCap size={16} />}
            tone="bg-brand-soft text-brand"
            title={lt(lang, "learn.card.title")}
            note={lt(lang, "learn.page.progress", { done: d.learnCard.done, total: d.learnCard.total })}
            sub={t("dashboard.setup.next", { step: lt(lang, `learn.section.${d.learnCard.next.key}.title` as Parameters<typeof lt>[1]) })}
            action={
              canEdit ? (
                <StartSectionLink orgSlug={ctx.org.slug} section={d.learnCard.next.id} href={`${base}/${d.learnCard.next.path}`} label={lang === "ms" ? "Sambung" : "Resume"} variant="ghost" />
              ) : (
                <Link className={LINK} href={`${base}/learn`}>
                  {lt(lang, "learn.card.title")}
                </Link>
              )
            }
          />
        )}
        {d.setup && canEdit && (
          <div id="finish-setup" className="card flex scroll-mt-4 flex-col gap-2 px-4 py-3" data-testid="dashboard-finish-setup">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand" aria-hidden="true">
                <Settings size={16} />
              </span>
              <span className="flex-1 text-[13px] font-medium text-ink">{lang === "ms" ? "Lengkapkan persediaan" : "Finish setup"}</span>
              <HideSetupButton orgSlug={ctx.org.slug} label={lang === "ms" ? "Sudah siap, sembunyikan" : "I'm all set, hide this"} />
            </div>
            <ul className="m-0 flex list-none flex-col gap-1 p-0 pl-11">
              <li className="text-[12.5px]">
                <Link className="font-medium text-brand hover:underline" href={`${base}/settings/profile`}>
                  {lang === "ms" ? "Isi pengecam kawal selia anda" : "Fill in your regulatory identifiers"}
                </Link>
                <span className="text-muted">
                  {" "}
                  · {lang === "ms" ? "Tiada" : "Missing"}: {d.setup.missing.length > 1 ? `${d.setup.missing.slice(0, -1).join(", ")} ${lang === "ms" ? "dan" : "and"} ${d.setup.missing.at(-1)}` : d.setup.missing[0]}
                </span>
              </li>
            </ul>
          </div>
        )}
      </div>

      <div className="mt-[18px] grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]" data-testid="dashboard-kpis">
        <div className="card flex flex-col justify-between p-5">
          <h2 className="m-0 text-[11.5px] font-medium uppercase tracking-[0.07em] text-muted">{t("dashboard.kpi.cash")}</h2>
          <div>
            <div className="num-sans mt-3 whitespace-nowrap font-semibold leading-none tracking-[-0.02em] text-ink">
              <Money sen={d.kpi.cash} />
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <span className="truncate text-[12px] text-muted">{dtn(lang, "dashboard.kpi.cash.hint", d.kpi.cashCount)}</span>
            </div>
          </div>
        </div>
        <div className="card grid grid-cols-1 divide-y divide-border p-0 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {[
            ["dashboard.kpi.revenue", now.revenue, delta(now.revenue, last.revenue, true)],
            ["dashboard.kpi.expenses", now.expenses, delta(now.expenses, last.expenses, false)],
            ["dashboard.kpi.netProfit", now.net, netHint],
          ].map(([k, v, hint], i) => {
            const body = (
              <>
                <div className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-muted">{t(k as Parameters<typeof dt>[1])}</div>
                <div>
                  <div className="num-sans mt-2.5 font-semibold leading-none tracking-[-0.02em] text-ink">
                    <Money sen={v as number} />
                  </div>
                  <div className="mt-2 flex items-center gap-1 text-[11.5px] text-muted">{hint as ReactNode}</div>
                </div>
              </>
            );
            return i === 2 ? (
              <Link key={k as string} href={`${base}/reports#profit-and-loss`} className="flex flex-col justify-between px-4 py-4 transition-colors hover:bg-surface-2">
                {body}
              </Link>
            ) : (
              <div key={k as string} className="flex flex-col justify-between px-4 py-4">
                {body}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3.5 flex flex-col gap-2.5">
        <Strip
          testid="dashboard-compliance"
          icon={<ShieldCheck size={16} />}
          tone="bg-surface-2 text-ink-2"
          title={t("dashboard.einvoice.title")}
          note={t("dashboard.einvoice.notSetUp.headline")}
          sub={t("dashboard.einvoice.notSetUp.body")}
          action={
            <Link className={LINK} href={`${base}/settings/profile`}>
              {t("dashboard.einvoice.notSetUp.action")} <ChevronRight size={14} aria-hidden="true" />
            </Link>
          }
        />
        {d.hasSst && (
          <Strip
            testid="dashboard-sst"
            icon={<Receipt size={16} />}
            tone="bg-surface-2 text-ink-2"
            title={t("dashboard.sst.title")}
            sub={t("dashboard.sst.body")}
            action={
              <Link className={LINK} href={`${base}/sst`}>
                {t("dashboard.sst.action")} <ChevronRight size={14} aria-hidden="true" />
              </Link>
            }
          />
        )}
      </div>

      <div className="mt-3.5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]" data-testid="dashboard-balances">
        <div className="card flex flex-col p-0 sm:col-span-2 lg:col-span-1">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-2.5 pt-3.5">
            <div>
              <h2 className={H2}>{t("dashboard.accounts.title")}</h2>
              <div className="mt-px text-[11.5px] text-muted">{d.cash.length === 0 ? t("dashboard.accounts.none") : dtn(lang, "dashboard.accounts.count", d.cash.length)}</div>
            </div>
            <Link className={cn(LINK, "-mr-2")} href={`${base}/reconcile`}>
              {t("dashboard.accounts.action")} <ChevronRight size={14} aria-hidden="true" />
            </Link>
          </div>
          <div className="border-t border-border">
            {d.cash.length === 0 ? (
              <p className="m-0 px-4 py-4 text-[12.5px] text-muted">{t("dashboard.accounts.empty")}</p>
            ) : (
              d.cash.map((a) => (
                <div key={a.code} className="flex items-center gap-3 border-b border-border px-4 py-[11px] last:border-b-0">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-[11.5px] font-bold tracking-[0.02em] text-ink-2" aria-hidden="true">
                    {initials(a.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-medium tracking-[-0.005em] text-ink">{a.name}</div>
                    <div className="num mt-px text-[11.5px] text-muted">{a.code}</div>
                  </div>
                  <div className={cn("num-sans text-right text-[13px] font-semibold", a.balance < 0 ? "text-negative" : "text-ink")}>{rm(a.balance)}</div>
                </div>
              ))
            )}
          </div>
        </div>
        {openCard("in", d.owedToYou)}
        {openCard("out", d.youOwe)}
      </div>

      <div className="mt-3.5">
        <div className="card px-[18px] py-4" data-testid="dashboard-cashflow">
          <h2 className={H2}>{t("dashboard.cashflow.title")}</h2>
          <div className="mt-0.5 text-[11.5px] text-muted">{t("dashboard.cashflow.sub")}</div>
          {d.hasHistory ? (
            <CashflowChart
              months={d.months}
              lang={lang}
              ariaLabel={t("dashboard.cashflow.aria", {
                month: d.months.at(-1)!.key,
                rev: rm(d.months.at(-1)!.revenue),
                exp: rm(d.months.at(-1)!.expenses),
              })}
            />
          ) : (
            <div className="mt-3 rounded-[var(--radius)] border border-dashed border-border-strong px-4 py-5 text-center">
              <div className="text-[12.5px] font-medium text-ink">{t("dashboard.cashflow.empty.title")}</div>
              <div className="mt-0.5 text-[12px] text-muted">{t("dashboard.cashflow.empty.body")}</div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3.5">
        <div className="card p-0" data-testid="dashboard-feed">
          <div className="flex flex-wrap items-center justify-between gap-2 px-[18px] pb-2.5 pt-3.5">
            <div>
              <h2 className={H2}>{t("dashboard.feed.title")}</h2>
              <div className="mt-px text-[11.5px] text-muted">{t("dashboard.feed.sub")}</div>
            </div>
            <Link className={cn(LINK, "-mr-2")} href={`${base}/ledger`}>
              {t("dashboard.feed.action")} <ChevronRight size={14} aria-hidden="true" />
            </Link>
          </div>
          {d.feed.length === 0 ? (
            <div className="border-t border-border px-[18px] py-8 text-center text-[12px] text-muted">{t("dashboard.feed.empty")}</div>
          ) : (
            <>
              <div className="overflow-x-auto border-t border-border max-sm:hidden">
                <table className="w-full border-collapse text-[12.5px]">
                  <tbody>
                    {d.feed.map((r) => (
                      <tr key={r.id} className="border-b border-border transition-colors last:border-b-0 hover:bg-surface-2">
                        <td className="num-sans whitespace-nowrap px-[18px] py-2.5 text-ink-2">{r.date}</td>
                        <td className="px-2 py-2.5">
                          <Link href={feedHref(r)} className="font-medium text-ink hover:underline">
                            {r.party ?? r.memo ?? r.number}
                          </Link>
                          <div className="text-[11.5px] text-muted">
                            <span className="num">{r.docs ?? r.number}</span>
                            {r.source === "void" && r.memo ? ` · ${r.memo}` : ""}
                          </div>
                        </td>
                        <td className="px-2 py-2.5">
                          <span className="chip">{SOURCE[r.source]?.[lang === "ms" ? 1 : 0] ?? r.source}</span>
                        </td>
                        <td className="truncate px-2 py-2.5 text-ink-2">{r.account ?? t("dashboard.feed.unknownAccount")}</td>
                        <td className={cn("num whitespace-nowrap px-2 py-2.5 text-right", r.reversed ? "text-muted line-through" : "text-ink")}>{rm(r.amount)}</td>
                        <td className="px-[18px] py-2.5 text-right">
                          <span className={r.reversed ? "chip warn" : "chip pos"}>{r.reversed ? t("dashboard.feed.status.reversed") : t("dashboard.feed.status.recorded")}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul role="list" aria-label={t("dashboard.feed.title")} className="m-0 list-none overflow-hidden border-t border-border p-0 sm:hidden">
                {d.feed.map((r) => (
                  <li key={r.id} className="border-b border-border last:border-b-0">
                    <Link href={feedHref(r)} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] font-medium text-ink">{r.party ?? r.memo ?? r.number}</div>
                        <div className="text-[11.5px] text-muted">
                          {r.date} · {SOURCE[r.source]?.[lang === "ms" ? 1 : 0] ?? r.source}
                          {r.reversed ? ` · ${t("dashboard.feed.status.reversed")}` : ""}
                        </div>
                      </div>
                      <div className={cn("num-sans text-[13px] font-semibold", r.reversed ? "text-muted line-through" : "text-ink")}>{rm(r.amount)}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
