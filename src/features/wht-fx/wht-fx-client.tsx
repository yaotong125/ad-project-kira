"use client";

import { Download } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { COMMON_CURRENCIES } from "@/features/accounting-settings/types";
import { Button } from "@/shared/ui/button";
import { Input, Select } from "@/shared/ui/form-controls";
import {
  postFxRevaluationAction,
  recordWhtEntryAction,
  remitWhtEntryAction,
  reverseFxRevaluationAction,
  voidWhtEntryAction,
} from "./actions";
import {
  WHT_SECTIONS,
  type AccountChoice,
  type FxRevaluationRow,
  type WhtEntryRow,
  type WhtSectionCode,
} from "./types";

function fmtRm(n: number) {
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// -----------------------------------------------------------------------------
// 1. Malaysian Withholding Tax (CP37 / CP37A / CP37D / CP107D)
// -----------------------------------------------------------------------------
function WhtRow({
  orgSlug,
  row,
  bankAccounts,
  canEdit,
  today,
}: {
  orgSlug: string;
  row: WhtEntryRow;
  bankAccounts: AccountChoice[];
  canEdit: boolean;
  today: string;
}) {
  const router = useRouter();
  const [remitting, setRemitting] = useState(false);
  const [remitDate, setRemitDate] = useState(today);
  const [bankId, setBankId] = useState(bankAccounts[0]?.id ?? "");
  const [ref, setRef] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const overdue = row.status === "unremitted" && row.dueDate < today;

  return (
    <>
      <tr className="border-t border-border align-top">
        <td className="px-3.5 py-2.5 whitespace-nowrap">
          <div className="num font-medium text-ink">{row.whtNumber}</div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="chip">{row.formCode}</span>
            <span className="num text-[11.5px] text-muted">{row.whtRate}%</span>
          </div>
        </td>
        <td className="px-3 py-2.5">
          <div className="font-medium text-ink">{row.payeeName}</div>
          <div className="text-[11.5px] text-muted">
            {row.payeeCountry}
            {row.payeeTin ? ` · TIN ${row.payeeTin}` : ""}
          </div>
          {row.memo && <div className="mt-0.5 text-[11.5px] text-muted">{row.memo}</div>}
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap text-[12.5px]">
          <div className="num text-ink">Paid {row.paymentDate}</div>
          <div className={`num text-[11.5px] ${overdue ? "font-medium text-negative" : "text-muted"}`}>
            LHDN due {row.dueDate}
          </div>
        </td>
        <td className="px-3 py-2.5 text-right whitespace-nowrap num">
          <div className="text-ink">{fmtRm(row.grossMyr)}</div>
          {row.currencyCode !== "MYR" && (
            <div className="text-[11.5px] text-muted">
              {row.currencyCode} {row.grossForeign.toLocaleString("en-MY", { minimumFractionDigits: 2 })} @ {row.exchangeRate.toFixed(4)}
            </div>
          )}
        </td>
        <td className="px-3 py-2.5 text-right whitespace-nowrap num font-semibold text-ink">{fmtRm(row.whtMyr)}</td>
        <td className="px-3 py-2.5 whitespace-nowrap">
          {row.status === "remitted" ? (
            <div>
              <span className="chip pos">Remitted</span>
              <div className="num mt-0.5 text-[11px] text-muted">
                {row.remittedOn}
                {row.remittanceRef ? ` · ${row.remittanceRef}` : ""}
              </div>
            </div>
          ) : row.status === "void" ? (
            <span className="chip">Void</span>
          ) : overdue ? (
            <span className="chip neg">Overdue</span>
          ) : (
            <span className="chip warn">Unremitted</span>
          )}
        </td>
        <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
          <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
            {row.journalEntryId && (
              <Link
                href={`/${orgSlug}/ledger/entries/${row.journalEntryId}`}
                className="text-[12px] font-medium text-brand hover:underline"
              >
                Journal
              </Link>
            )}
            {canEdit && row.status === "unremitted" && (
              <>
                <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => setRemitting((v) => !v)}>
                  Remit to LHDN
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    setErr(null);
                    start(async () => {
                      const r = await voidWhtEntryAction(orgSlug, row.id);
                      if (r.ok) router.refresh();
                      else setErr(r.error);
                    });
                  }}
                >
                  Void
                </Button>
              </>
            )}
          </div>
          {err && <div role="alert" className="mt-1 text-[11.5px] text-negative">{err}</div>}
        </td>
      </tr>
      {remitting && (
        <tr className="bg-surface-2/50">
          <td colSpan={7} className="px-4 py-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-[155px]">
                <label className="mb-1 block text-[11.5px] font-medium text-ink-2">Remittance date</label>
                <Input type="date" value={remitDate} onChange={(e) => setRemitDate(e.target.value)} className="h-[30px] text-[12.5px]" />
              </div>
              <div className="min-w-[200px] flex-1">
                <label className="mb-1 block text-[11.5px] font-medium text-ink-2">Paid from bank / cash</label>
                <Select value={bankId} onChange={(e) => setBankId(e.target.value)} className="h-[30px] text-[12.5px]">
                  {bankAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                  ))}
                </Select>
              </div>
              <div className="min-w-[200px] flex-1">
                <label className="mb-1 block text-[11.5px] font-medium text-ink-2">LHDN e-WHT / FPX receipt ref</label>
                <Input placeholder="e.g. LHDN-CP37D-202611-8891" value={ref} onChange={(e) => setRef(e.target.value)} className="h-[30px] text-[12.5px]" />
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    setErr(null);
                    start(async () => {
                      const r = await remitWhtEntryAction(orgSlug, {
                        id: row.id,
                        remittedOn: remitDate,
                        bankAccountId: bankId,
                        reference: ref,
                      });
                      if (r.ok) {
                        setRemitting(false);
                        router.refresh();
                      } else {
                        setErr(r.error);
                      }
                    });
                  }}
                >
                  {pending ? "Posting..." : `Post remittance (${fmtRm(row.whtMyr)})`}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setRemitting(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function WhtClient({
  orgSlug,
  rows,
  expenseAccounts,
  bankAccounts,
  latestRates,
  canEdit,
}: {
  orgSlug: string;
  rows: WhtEntryRow[];
  expenseAccounts: AccountChoice[];
  bankAccounts: AccountChoice[];
  latestRates: Record<string, number>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [payeeName, setPayeeName] = useState("");
  const [payeeTin, setPayeeTin] = useState("");
  const [payeeCountry, setPayeeCountry] = useState("Singapore");
  const [sectionCode, setSectionCode] = useState<WhtSectionCode>("s109b_special");
  const [whtRateStr, setWhtRateStr] = useState("10");
  const [paymentDate, setPaymentDate] = useState(today);
  const [currencyCode, setCurrencyCode] = useState("MYR");
  const [fxStr, setFxStr] = useState("1");
  const [grossStr, setGrossStr] = useState("");
  const [expId, setExpId] = useState(expenseAccounts[0]?.id ?? "");
  const [bankId, setBankId] = useState(bankAccounts[0]?.id ?? "");
  const [memo, setMemo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const grossForeign = Number(grossStr) || 0;
  const fx = Number(fxStr) || 1;
  const rate = Number(whtRateStr) || 0;
  const grossMyr = Math.round(grossForeign * fx * 100) / 100;
  const whtMyr = Math.round(grossMyr * (rate / 100) * 100) / 100;
  const netPaidMyr = Math.max(0, Math.round((grossMyr - whtMyr) * 100) / 100);
  const dueDate = addDays(paymentDate, 30);

  function exportCsv() {
    const header = ["WHT No", "Form", "Section", "Payee", "TIN", "Country", "Payment Date", "LHDN Due Date", "Currency", "FX Rate", "Gross (MYR)", "WHT %", "WHT (MYR)", "Net Paid (MYR)", "Status", "Remitted On", "Ref"];
    const lines = [
      header.join(","),
      ...rows.map((r) =>
        [
          r.whtNumber,
          r.formCode,
          r.sectionCode,
          `"${r.payeeName.replace(/"/g, '""')}"`,
          r.payeeTin ?? "",
          `"${r.payeeCountry.replace(/"/g, '""')}"`,
          r.paymentDate,
          r.dueDate,
          r.currencyCode,
          r.exchangeRate.toFixed(6),
          r.grossMyr.toFixed(2),
          r.whtRate.toFixed(2),
          r.whtMyr.toFixed(2),
          r.netPaidMyr.toFixed(2),
          r.status,
          r.remittedOn ?? "",
          `"${(r.remittanceRef ?? "").replace(/"/g, '""')}"`,
        ].join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kira-${orgSlug}-wht-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-5">
      {canEdit && (
        <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-5">
          <h2 className="m-0 text-[14px] font-semibold text-ink">Record withholding tax payment</h2>
          <p className="m-0 mt-1 text-[12.5px] text-muted">
            Posts Dr Expense (Gross MYR), Cr Bank (Net paid), and Cr 400-1100 Withholding Tax Payable, and tracks LHDN&apos;s 30-day remittance deadline.
          </p>

          <form
            className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              setMsg(null);
              setErr(null);
              start(async () => {
                const r = await recordWhtEntryAction(orgSlug, {
                  payeeName,
                  payeeTin,
                  payeeCountry,
                  sectionCode,
                  paymentDate,
                  currencyCode,
                  exchangeRate: fx,
                  grossForeign,
                  whtRate: rate,
                  expenseAccountId: expId,
                  bankAccountId: bankId,
                  memo,
                });
                if (r.ok) {
                  setPayeeName("");
                  setPayeeTin("");
                  setGrossStr("");
                  setMemo("");
                  setMsg("Withholding tax deduction recorded and posted to the ledger.");
                  router.refresh();
                } else {
                  setErr(r.error);
                }
              });
            }}
          >
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="wht-payee" className="text-[12.5px] font-medium text-ink-2">
                Payee (non-resident / agent)<span className="ml-0.5 text-negative">*</span>
              </label>
              <Input id="wht-payee" required placeholder="e.g. Acme Cloud Pte Ltd" value={payeeName} onChange={(e) => setPayeeName(e.target.value)} />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="wht-country" className="text-[12.5px] font-medium text-ink-2">Payee country</label>
              <Input id="wht-country" placeholder="e.g. Singapore, USA, Malaysia" value={payeeCountry} onChange={(e) => setPayeeCountry(e.target.value)} />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="wht-tin" className="text-[12.5px] font-medium text-ink-2">Payee TIN / Tax ID</label>
              <Input id="wht-tin" placeholder="Optional LHDN / foreign Tax ID" value={payeeTin} onChange={(e) => setPayeeTin(e.target.value)} />
            </div>

            <div className="flex min-w-0 flex-col gap-1 sm:col-span-2">
              <label htmlFor="wht-sec" className="text-[12.5px] font-medium text-ink-2">Income Tax Act 1967 section</label>
              <Select
                id="wht-sec"
                value={sectionCode}
                onChange={(e) => {
                  const next = e.target.value as WhtSectionCode;
                  setSectionCode(next);
                  const found = WHT_SECTIONS.find((s) => s.code === next);
                  if (found) setWhtRateStr(String(found.defaultRate));
                }}
              >
                {WHT_SECTIONS.map((s) => (
                  <option key={s.code} value={s.code}>{s.label}</option>
                ))}
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="wht-rate" className="text-[12.5px] font-medium text-ink-2">WHT rate (%) (DTA override ok)</label>
              <Input id="wht-rate" type="number" min="0.01" max="50" step="any" required value={whtRateStr} onChange={(e) => setWhtRateStr(e.target.value)} className="num" />
            </div>

            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="wht-date" className="text-[12.5px] font-medium text-ink-2">Payment / credit date</label>
              <Input id="wht-date" type="date" required value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="wht-ccy" className="text-[12.5px] font-medium text-ink-2">Currency</label>
              <Select
                id="wht-ccy"
                value={currencyCode}
                onChange={(e) => {
                  const c = e.target.value;
                  setCurrencyCode(c);
                  setFxStr(String(latestRates[c] ?? (c === "MYR" ? 1 : "")));
                }}
              >
                <option value="MYR">MYR · Malaysian Ringgit</option>
                {COMMON_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.code} · {c.name}</option>
                ))}
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="wht-fx" className="text-[12.5px] font-medium text-ink-2">
                {currencyCode === "MYR" ? "Exchange rate" : `MYR per 1 ${currencyCode}`}
              </label>
              <Input
                id="wht-fx"
                type="number"
                min="0.000001"
                step="any"
                required
                disabled={currencyCode === "MYR"}
                value={fxStr}
                onChange={(e) => setFxStr(e.target.value)}
                className="num"
              />
            </div>

            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="wht-gross" className="text-[12.5px] font-medium text-ink-2">
                Gross invoice amount ({currencyCode})<span className="ml-0.5 text-negative">*</span>
              </label>
              <Input id="wht-gross" type="number" min="0.01" step="any" required placeholder="0.00" value={grossStr} onChange={(e) => setGrossStr(e.target.value)} className="num" />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="wht-exp" className="text-[12.5px] font-medium text-ink-2">Expense / AP account</label>
              <Select id="wht-exp" value={expId} onChange={(e) => setExpId(e.target.value)}>
                {expenseAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                ))}
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="wht-bank" className="text-[12.5px] font-medium text-ink-2">Bank / cash account</label>
              <Select id="wht-bank" value={bankId} onChange={(e) => setBankId(e.target.value)}>
                {bankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                ))}
              </Select>
            </div>

            <div className="flex min-w-0 flex-col gap-1 sm:col-span-2">
              <label htmlFor="wht-memo" className="text-[12.5px] font-medium text-ink-2">Reference / description</label>
              <Input id="wht-memo" placeholder="Optional invoice ref or DTA treaty note" value={memo} onChange={(e) => setMemo(e.target.value)} />
            </div>
            <div className="flex items-end justify-end">
              <Button type="submit" size="sm" className="h-[34px] w-full sm:w-auto" disabled={pending}>
                {pending ? "Posting..." : "Record WHT deduction"}
              </Button>
            </div>
          </form>

          {grossMyr > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2 text-[12px] text-ink-2 num">
              <span>
                Gross: <strong className="text-ink">{fmtRm(grossMyr)}</strong> · WHT ({rate}%):{" "}
                <strong className="text-ink">{fmtRm(whtMyr)}</strong> · Net paid to payee:{" "}
                <strong className="text-ink">{fmtRm(netPaidMyr)}</strong>
              </span>
              <span>LHDN due by {dueDate}</span>
            </div>
          )}
          {msg && <p role="status" className="m-0 mt-2 text-[12.5px] font-medium text-positive">{msg}</p>}
          {err && <p role="alert" className="m-0 mt-2 text-[12.5px] text-negative">{err}</p>}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-[13.5px] font-semibold text-ink">Withholding tax register ({rows.length})</h2>
          {rows.length > 0 && (
            <Button type="button" size="sm" variant="secondary" onClick={exportCsv}>
              <Download size={13} aria-hidden="true" /> Export CP37 CSV
            </Button>
          )}
        </div>
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface">
          <table className="w-full border-collapse text-left text-[13px]" data-testid="wht-table">
            <thead>
              <tr className="bg-surface-2/60 text-[11px] font-semibold tracking-[0.04em] text-muted uppercase">
                <th className="px-3.5 py-2.5">WHT No / Form</th>
                <th className="px-3 py-2.5">Payee</th>
                <th className="px-3 py-2.5">Dates</th>
                <th className="px-3 py-2.5 text-right">Gross (MYR)</th>
                <th className="px-3 py-2.5 text-right">WHT (MYR)</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3.5 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[13px] text-muted">
                    No withholding tax deductions recorded yet.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <WhtRow key={r.id} orgSlug={orgSlug} row={r} bankAccounts={bankAccounts} canEdit={canEdit} today={today} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// -----------------------------------------------------------------------------
// 2. Foreign Currency (FX) Revaluation
// -----------------------------------------------------------------------------
export function FxRevaluationClient({
  orgSlug,
  rows,
  accounts,
  latestRates,
  canEdit,
}: {
  orgSlug: string;
  rows: FxRevaluationRow[];
  accounts: AccountChoice[];
  latestRates: Record<string, { rate: number; date: string }>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [revalDate, setRevalDate] = useState(today);
  const [accountId, setAccountId] = useState(accounts.find((a) => a.isCash)?.id ?? accounts[0]?.id ?? "");
  const [ccy, setCcy] = useState("USD");
  const [foreignStr, setForeignStr] = useState("");
  const [closingStr, setClosingStr] = useState(latestRates.USD ? String(latestRates.USD.rate) : "4.4500");
  const [carryingStr, setCarryingStr] = useState("");
  const [memo, setMemo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const { revalued, diff } = useMemo(() => {
    const f = Number(foreignStr) || 0;
    const r = Number(closingStr) || 0;
    const c = Number(carryingStr) || 0;
    const rev = Math.round(f * r * 100) / 100;
    return { revalued: rev, diff: Math.round((rev - c) * 100) / 100 };
  }, [foreignStr, closingStr, carryingStr]);

  return (
    <div className="flex flex-col gap-5">
      {canEdit && (
        <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="m-0 text-[14px] font-semibold text-ink">Post month-end FX revaluation</h2>
              <p className="m-0 mt-1 text-[12.5px] text-muted">
                Revalues a foreign currency bank, receivable, or payable balance to the closing MYR rate and posts unrealised FX gain (900-0500) or loss (800-9500).
              </p>
            </div>
            <Link href={`/${orgSlug}/settings/exchange-rates`} className="text-[12.5px] font-medium text-brand hover:underline">
              Manage exchange rates →
            </Link>
          </div>

          <form
            className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              setMsg(null);
              setErr(null);
              start(async () => {
                const r = await postFxRevaluationAction(orgSlug, {
                  revalDate,
                  accountId,
                  currencyCode: ccy,
                  foreignBalance: Number(foreignStr) || 0,
                  closingRate: Number(closingStr) || 0,
                  carryingMyr: Number(carryingStr) || 0,
                  memo,
                });
                if (r.ok) {
                  setForeignStr("");
                  setCarryingStr("");
                  setMemo("");
                  setMsg("FX revaluation journal posted.");
                  router.refresh();
                } else {
                  setErr(r.error);
                }
              });
            }}
          >
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="fxr-date" className="text-[12.5px] font-medium text-ink-2">Revaluation date</label>
              <Input id="fxr-date" type="date" required value={revalDate} onChange={(e) => setRevalDate(e.target.value)} />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="fxr-acct" className="text-[12.5px] font-medium text-ink-2">Asset / liability account</label>
              <Select id="fxr-acct" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                ))}
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="fxr-ccy" className="text-[12.5px] font-medium text-ink-2">Foreign currency</label>
              <Select
                id="fxr-ccy"
                value={ccy}
                onChange={(e) => {
                  const next = e.target.value;
                  setCcy(next);
                  if (latestRates[next]) setClosingStr(String(latestRates[next].rate));
                }}
              >
                {COMMON_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.code} · {c.name}</option>
                ))}
              </Select>
            </div>

            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="fxr-fbal" className="text-[12.5px] font-medium text-ink-2">
                Closing balance ({ccy})<span className="ml-0.5 text-negative">*</span>
              </label>
              <Input id="fxr-fbal" type="number" step="any" required placeholder="e.g. 10000.00" value={foreignStr} onChange={(e) => setForeignStr(e.target.value)} className="num" />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="fxr-rate" className="text-[12.5px] font-medium text-ink-2">
                Closing rate (MYR / 1 {ccy})<span className="ml-0.5 text-negative">*</span>
              </label>
              <Input id="fxr-rate" type="number" min="0.000001" step="any" required value={closingStr} onChange={(e) => setClosingStr(e.target.value)} className="num" />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="fxr-carry" className="text-[12.5px] font-medium text-ink-2">
                Current carrying book value (MYR)<span className="ml-0.5 text-negative">*</span>
              </label>
              <Input id="fxr-carry" type="number" step="any" required placeholder="e.g. 44000.00" value={carryingStr} onChange={(e) => setCarryingStr(e.target.value)} className="num" />
            </div>

            <div className="flex min-w-0 flex-col gap-1 sm:col-span-2">
              <label htmlFor="fxr-memo" className="text-[12.5px] font-medium text-ink-2">Memo</label>
              <Input id="fxr-memo" placeholder="e.g. Nov 2026 month-end BNM closing rate" value={memo} onChange={(e) => setMemo(e.target.value)} />
            </div>
            <div className="flex items-end justify-end">
              <Button type="submit" size="sm" className="h-[34px] w-full sm:w-auto" disabled={pending || diff === 0}>
                {pending ? "Posting..." : "Post revaluation"}
              </Button>
            </div>
          </form>

          {foreignStr && carryingStr && (
            <div className="mt-3 rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2 text-[12px] text-ink-2 num">
              Revalued MYR: <strong className="text-ink">{fmtRm(revalued)}</strong> &nbsp;·&nbsp; Unrealised FX{" "}
              <strong className={diff > 0 ? "text-positive" : diff < 0 ? "text-negative" : "text-ink"}>
                {diff > 0 ? `Gain +${fmtRm(diff)}` : diff < 0 ? `Loss -${fmtRm(Math.abs(diff))}` : "RM 0.00"}
              </strong>
            </div>
          )}
          {msg && <p role="status" className="m-0 mt-2 text-[12.5px] font-medium text-positive">{msg}</p>}
          {err && <p role="alert" className="m-0 mt-2 text-[12.5px] text-negative">{err}</p>}
        </section>
      )}

      <section className="flex flex-col gap-2.5">
        <h2 className="m-0 text-[13.5px] font-semibold text-ink">Revaluation history ({rows.length})</h2>
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface">
          <table className="w-full border-collapse text-left text-[13px]" data-testid="fx-reval-table">
            <thead>
              <tr className="bg-surface-2/60 text-[11px] font-semibold tracking-[0.04em] text-muted uppercase">
                <th className="px-3.5 py-2.5">Date</th>
                <th className="px-3 py-2.5">Account</th>
                <th className="px-3 py-2.5 text-right">Foreign balance</th>
                <th className="px-3 py-2.5 text-right">Closing rate</th>
                <th className="px-3 py-2.5 text-right">Unrealised G/L</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3.5 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[13px] text-muted">
                    No FX revaluations posted yet.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-t border-border align-middle">
                    <td className="px-3.5 py-2.5 whitespace-nowrap num text-ink">{r.revalDate}</td>
                    <td className="px-3 py-2.5 text-ink">{r.accountLabel}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap num text-ink">
                      {r.currencyCode} {r.foreignBalance.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap num text-muted">RM {r.closingRate.toFixed(4)}</td>
                    <td
                      className={`px-3 py-2.5 text-right whitespace-nowrap num font-semibold ${
                        r.gainLossMyr >= 0 ? "text-positive" : "text-negative"
                      }`}
                    >
                      {r.gainLossMyr >= 0 ? `+${fmtRm(r.gainLossMyr)}` : `-${fmtRm(Math.abs(r.gainLossMyr))}`}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={r.status === "posted" ? "chip pos" : "chip"}>
                        {r.status === "posted" ? "Posted" : "Reversed"}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        {r.journalEntryId && (
                          <Link href={`/${orgSlug}/ledger/entries/${r.journalEntryId}`} className="text-[12px] font-medium text-brand hover:underline">
                            Journal
                          </Link>
                        )}
                        {canEdit && r.status === "posted" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={pending}
                            onClick={() => {
                              setErr(null);
                              start(async () => {
                                const res = await reverseFxRevaluationAction(orgSlug, r.id);
                                if (res.ok) router.refresh();
                                else setErr(res.error);
                              });
                            }}
                          >
                            Reverse (next day)
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
