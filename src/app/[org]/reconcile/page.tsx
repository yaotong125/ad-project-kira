import type { Metadata } from "next";
import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { accountOptions, todayMY } from "@/features/books/load";
import { rm, toSen } from "@/features/books/money";
import { rt } from "@/features/reconcile/copy";
import { ReconcileLines, SaveReconciliationButton, type BankLine } from "@/features/reconcile/reconcile-lines";
import { first, type SearchParams } from "@/shared/i18n";
import { loadOrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { buttonClass } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";
import { Input, Select } from "@/shared/ui/form-controls";
import { PageHeader } from "@/shared/ui/page-header";

/** Rendered per request (session, entity). */
export const instant = false;

export const metadata: Metadata = { title: "Reconcile", robots: { index: false } };

const TH = "border-b border-border px-[var(--pad-x)] py-2 text-left text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted";
const TD = "h-[var(--row-h)] border-b border-border px-[var(--pad-x)] align-middle";
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/**
 * /{slug}/reconcile: lejar.ai's "Reconcile bank account" (observed 2026-11-22, incl. a GET tie-out of
 * 300-0900). The Statement details form submits ?account=&balance=&date=; the result shows the strip,
 * the tie-out (adjusted = closing + outstanding; difference = GL − adjusted), and the lines to tick.
 */
export default async function Page({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<SearchParams> }) {
  const [{ org }, sp] = await Promise.all([params, searchParams]);
  const ctx = await loadOrgContext(org);
  const { lang } = ctx;
  const t = (k: Parameters<typeof rt>[1], v?: Record<string, string | number>) => rt(lang, k, v);
  const supabase = await createSupabaseServerClient();
  const base = `/${ctx.org.slug}`;
  const canEdit = ctx.role !== "viewer";
  const cash = (await accountOptions(supabase, ctx.org.id)).filter((a) => a.isCash);
  const account = cash.find((a) => a.code === first(sp.account)) ?? null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(first(sp.date) ?? "") ? first(sp.date)! : todayMY();
  const balanceRaw = (first(sp.balance) ?? "").trim();
  const balanceSen = balanceRaw === "" ? null : toSen(balanceRaw);

  const { data: history } = await supabase
    .from("reconciliations")
    .select("id, statement_date, closing_balance, gl_balance, status, saved_at, accounts(code, name)")
    .eq("org_id", ctx.org.id)
    .order("statement_date", { ascending: false })
    .order("saved_at", { ascending: false })
    .limit(50);
  const rows = (history ?? []).filter((h) => !account || one(h.accounts as { code: string } | { code: string }[] | null)?.code === account.code);

  const form = (
    <div className="rounded-lg border border-border bg-surface p-4" data-flow="reconcile-setup">
      <h2 className="mb-3 text-[13.5px] font-semibold text-ink">{t("reconcile.form.title")}</h2>
      {cash.length === 0 ? (
        <div className="flex flex-col items-start gap-2">
          <p className="m-0 text-[13px] font-medium text-ink">{t("reconcile.noBank.title")}</p>
          <Link href={`${base}/import`} className={buttonClass("secondary", "sm")}>
            {t("reconcile.noBank.action")}
          </Link>
        </div>
      ) : (
        <form className="flex flex-wrap items-end gap-3" method="get" action={`${base}/reconcile`}>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="account" className="text-[13px] font-medium text-ink-2">
              {t("reconcile.form.account")}
            </label>
            <Select id="account" name="account" defaultValue={account?.code ?? ""} className="min-w-[280px]" required>
              <option value="" disabled>
                {t("reconcile.form.accountPlaceholder")}
              </option>
              {cash.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} · {a.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="balance" className="text-[13px] font-medium text-ink-2">
              {t("reconcile.form.balance")}
            </label>
            <Input id="balance" type="number" step="0.01" name="balance" defaultValue={balanceRaw} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="date" className="text-[13px] font-medium text-ink-2">
              {t("reconcile.form.date")}
            </label>
            <Input id="date" type="date" name="date" defaultValue={date} />
          </div>
          <button type="submit" className={buttonClass("secondary")}>
            {t("reconcile.form.submit")}
          </button>
        </form>
      )}
    </div>
  );

  const historyTable = (title: string) => (
    <section className="flex flex-col gap-2">
      <h2 className="m-0 text-[13.5px] font-semibold text-ink">{title}</h2>
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border py-10 text-center">
          <p className="text-sm font-medium text-ink">{t("reconcile.landing.emptyTitle")}</p>
          <div className="max-w-[560px] text-[13px] text-muted">{account ? t("reconcile.history.empty") : t("reconcile.landing.emptyBody")}</div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
          <table className="w-full border-collapse text-[13px]">
            <thead className="bg-surface">
              <tr>
                <th className={TH}>{t("reconcile.th.account")}</th>
                <th className={TH}>{t("reconcile.th.statementDate")}</th>
                <th className={cn(TH, "text-right")}>{t("reconcile.th.closing")}</th>
                <th className={cn(TH, "text-right")}>{t("reconcile.th.gl")}</th>
                <th className={TH}>{t("reconcile.th.status")}</th>
                <th className={TH}>{t("reconcile.th.saved")}</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => {
                const a = one(h.accounts as { code: string; name: string } | { code: string; name: string }[] | null);
                return (
                  <tr key={h.id}>
                    <td className={cn(TD, "text-ink-2")}>{a ? `${a.code} · ${a.name}` : "-"}</td>
                    <td className={cn(TD, "num-sans text-ink-2")}>{h.statement_date}</td>
                    <td className={cn(TD, "num-sans text-right text-ink")}>{rm(toSen(String(h.closing_balance)) ?? 0)}</td>
                    <td className={cn(TD, "num-sans text-right text-ink")}>{rm(toSen(String(h.gl_balance)) ?? 0)}</td>
                    <td className={TD}>
                      <span className={h.status === "reconciled" ? "chip pos" : "chip warn"}>{h.status === "reconciled" ? t("reconcile.badge.reconciled") : t("reconcile.badge.notReconciled")}</span>
                    </td>
                    <td className={cn(TD, "num-sans text-muted")}>{new Date(h.saved_at).toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" })}</td>
                    <td className={TD}>
                      <Link className={buttonClass("ghost", "sm")} href={`${base}/reconcile?account=${a?.code ?? ""}&balance=${h.closing_balance}&date=${h.statement_date}`}>
                        {t("reconcile.th.open")}
                      </Link>
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

  if (!account) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t("reconcile.title")} sub={<>{ctx.org.legal_name} · {t("reconcile.subLanding")}</>} />
        {form}
        {historyTable(t("reconcile.landing.title"))}
      </div>
    );
  }

  // Bank-side journal lines up to the statement date.
  const { data: jl } = await supabase
    .from("journal_lines")
    .select("id, debit, credit, description, reconciled_on, reconcile_source, journal_entries!inner(occurred_on, memo)")
    .eq("org_id", ctx.org.id)
    .eq("account_id", (await supabase.from("accounts").select("id").eq("org_id", ctx.org.id).eq("code", account.code).single()).data?.id ?? "")
    .lte("journal_entries.occurred_on", date);
  const lines: BankLine[] = (jl ?? [])
    .map((l) => {
      const e = one(l.journal_entries as { occurred_on: string; memo: string | null } | { occurred_on: string; memo: string | null }[])!;
      return {
        id: l.id,
        date: e.occurred_on,
        memo: e.memo ?? l.description,
        debit: toSen(String(l.debit)) ?? 0,
        credit: toSen(String(l.credit)) ?? 0,
        reconciledOn: l.reconciled_on,
        source: l.reconcile_source,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  const cleared = lines.filter((l) => l.reconciledOn && l.reconciledOn <= date);
  const outstanding = lines.filter((l) => !(l.reconciledOn && l.reconciledOn <= date));
  const net = (ls: BankLine[]) => ls.reduce((s, l) => s + l.debit - l.credit, 0);
  const gl = net(lines);
  const outstandingSum = net(outstanding);
  const adjusted = balanceSen === null ? null : balanceSen + outstandingSum;
  const difference = adjusted === null ? null : gl - adjusted;
  const reconciled = difference === 0;
  const badge = difference === null ? ["chip", t("reconcile.badge.enterBalance")] : reconciled ? ["chip pos", t("reconcile.badge.reconciled")] : ["chip warn", t("reconcile.badge.notReconciled")];
  const row = (label: string, value: string, strong = false) => (
    <div className="flex items-center justify-between">
      <span className={cn("text-[12.5px]", strong ? "font-medium text-ink" : "text-muted")}>{label}</span>
      <span className={cn("num-sans text-[12.5px]", strong ? "font-semibold text-ink" : "text-ink-2")}>{value}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("reconcile.titleAccount", { code: account.code, name: account.name })}
        sub={<>{ctx.org.legal_name} · {t("reconcile.subAsOf", { date })}</>}
        actions={
          <Link className={buttonClass("secondary")} href={`${base}/banking/transfers/new?from=${account.code}`}>
            Transfer
          </Link>
        }
      />
      {form}
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-5 rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center gap-3">
            <div className="grid size-[38px] shrink-0 place-items-center rounded-[var(--radius)] bg-brand-soft text-brand">
              <CircleCheck size={18} aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] font-medium text-ink">{t("reconcile.strip.cleared", { cleared: cleared.length, total: lines.length })}</span>
              <span className="text-[11.5px] text-muted">{t("reconcile.strip.outstanding", { count: outstanding.length })}</span>
            </div>
          </div>
          <div className="grid flex-1 grid-cols-1 gap-4 sm:min-w-[360px] sm:grid-cols-3">
            {[
              [t("reconcile.strip.statement"), balanceSen === null ? "—" : rm(balanceSen), ""],
              [t("reconcile.strip.gl"), rm(gl), ""],
              [t("reconcile.difference"), difference === null ? "—" : rm(difference), reconciled ? "text-positive" : difference === null ? "" : "text-negative"],
            ].map(([label, value, tone]) => (
              <div key={label} className="flex flex-col gap-0.5">
                <span className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-muted">{label}</span>
                <span className={cn("num-sans text-[13.5px] font-semibold text-ink", tone)}>{value}</span>
              </div>
            ))}
          </div>
          {canEdit && balanceSen !== null && (
            <div className="ml-auto">
              <SaveReconciliationButton key={`${difference}-${cleared.length}`} orgSlug={ctx.org.slug} lang={lang} account={account.code} date={date} balance={(balanceSen / 100).toFixed(2)} />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
          <h2 className="text-[13.5px] font-semibold text-ink">{t("reconcile.tieOut.title")}</h2>
          {row(t("reconcile.tieOut.closing"), balanceSen === null ? "—" : rm(balanceSen))}
          {row(t("reconcile.tieOut.outstanding", { count: outstanding.length }), rm(outstandingSum))}
          <div className="border-t border-border pt-2">{row(t("reconcile.tieOut.adjusted"), adjusted === null ? "—" : rm(adjusted), true)}</div>
          {row(t("reconcile.tieOut.gl"), rm(gl), true)}
          <div className="mt-1 flex items-center justify-between border-t-2 border-border-strong pt-2">
            <span className="text-[14px] font-semibold text-ink">{t("reconcile.difference")}</span>
            <span className="flex items-center gap-2">
              <span className="num-sans text-[14px] font-semibold text-ink">{difference === null ? "—" : rm(difference)}</span>
              <span className={badge[0]}>{badge[1]}</span>
            </span>
          </div>
          {reconciled && <p className="m-0 mt-1 text-[12.5px] text-positive">{t("reconcile.confirmed")}</p>}
        </div>

        <ReconcileLines orgSlug={ctx.org.slug} lang={lang} statementDate={date} outstanding={outstanding} reconciled={cleared} canEdit={canEdit} />
        {historyTable(t("reconcile.history.title"))}
      </div>
    </div>
  );
}
