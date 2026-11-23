"use client";

import { Download, Plus, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { rm } from "@/features/books/money";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";
import { Input, Select } from "@/shared/ui/form-controls";
import { commitOpeningBalancesAction, reverseOpeningMigrationAction } from "./actions";
import { SAMPLE_CSV_TEMPLATE, parseTrialBalanceCsv } from "./parse-tb";
import { SOURCE_META, type AccountOption, type MigrationSource, type TbMappingRow } from "./types";

let seq = 1;
const blankRow = (): TbMappingRow => ({
  key: `m-${seq++}`,
  sourceCode: "",
  sourceName: "",
  accountId: "",
  debit: "",
  credit: "",
  matchedBy: "manual",
});

export function MigrateWizard({
  orgSlug,
  accounts,
  retainedEarningsLabel,
  defaultCutover,
  openRange,
}: {
  orgSlug: string;
  accounts: AccountOption[];
  retainedEarningsLabel: string;
  defaultCutover: string;
  openRange: { min: string; max: string } | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<MigrationSource>("csv");
  const [cutoverDate, setCutoverDate] = useState(defaultCutover);
  const [foldPnl, setFoldPnl] = useState(true);
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<TbMappingRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [committed, setCommitted] = useState<{ journalEntryId: string; lineCount: number; totalAmount: number } | null>(
    null,
  );
  const [pending, start] = useTransition();

  const acctById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const summary = useMemo(() => {
    let drSen = 0;
    let crSen = 0;
    let nonZero = 0;
    let unmapped = 0;
    let pnlCount = 0;
    let pnlNetSen = 0;

    for (const r of rows) {
      const dr = Math.round((Number(r.debit) || 0) * 100);
      const cr = Math.round((Number(r.credit) || 0) * 100);
      if (dr <= 0 && cr <= 0) continue;
      nonZero += 1;
      drSen += dr;
      crSen += cr;
      if (!r.accountId) {
        unmapped += 1;
      } else {
        const a = acctById.get(r.accountId);
        if (a && (a.type === "revenue" || a.type === "expense")) {
          pnlCount += 1;
          pnlNetSen += dr - cr;
        }
      }
    }

    const diffSen = drSen - crSen;
    return {
      drSen,
      crSen,
      diffSen,
      nonZero,
      unmapped,
      pnlCount,
      pnlNetSen,
      ready: nonZero >= 2 && drSen > 0 && diffSen === 0 && unmapped === 0,
    };
  }, [rows, acctById]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setParseErr(null);
    setSubmitErr(null);
    setCommitted(null);
    const text = await file.text();
    const res = parseTrialBalanceCsv(text, accounts);
    if (res.error) {
      setParseErr(res.error);
      return;
    }
    setFileName(file.name);
    setRows(res.rows);
  };

  const downloadTemplate = () => {
    const blob = new Blob([SAMPLE_CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kira-opening-balances-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const updateRow = (key: string, patch: Partial<TbMappingRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div className="flex flex-col gap-5">
      {/* 1. Source system picker */}
      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-[14px] font-semibold text-ink">1. Choose your previous system</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(["csv", "xero", "ubs", "manual"] as MigrationSource[]).map((s) => {
            const meta = SOURCE_META[s];
            const active = source === s;
            return (
              <button
                key={s}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setSource(s);
                  setParseErr(null);
                  if (s === "manual" && rows.length === 0) {
                    setRows([blankRow(), blankRow()]);
                  }
                }}
                className={cn(
                  "flex cursor-pointer flex-col items-start gap-1.5 rounded-[var(--radius-lg)] border p-4 text-left transition-colors",
                  active
                    ? "border-brand bg-surface ring-1 ring-brand/30"
                    : "border-border bg-surface hover:border-border-strong hover:bg-surface-2/60",
                )}
              >
                <span className="text-[13.5px] font-semibold text-ink">{meta.title}</span>
                <span className="text-[11px] font-medium text-brand">{meta.badge}</span>
                <span className="text-[12px] leading-relaxed text-muted">{meta.hint}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. Upload or add rows */}
      <section className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="m-0 text-[14px] font-semibold text-ink">
              2. {source === "manual" ? "Enter opening balances" : `Upload ${SOURCE_META[source].title} trial balance`}
            </h2>
            <p className="m-0 mt-1 text-[12.5px] text-muted">
              Balances as at the day before cutover. Every non-zero line maps to an active Kira account.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {source !== "manual" && (
              <>
                <Button type="button" size="sm" variant="secondary" onClick={downloadTemplate}>
                  <Download size={13} aria-hidden="true" /> Download CSV template
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.tsv,.txt,text/csv"
                  aria-label="Upload trial balance CSV"
                  className="hidden"
                  onChange={(e) => {
                    void handleFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <Button type="button" size="sm" variant="primary" onClick={() => fileRef.current?.click()}>
                  <Upload size={13} aria-hidden="true" /> Upload CSV
                </Button>
              </>
            )}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setRows((prev) => [...prev, blankRow()])}
            >
              <Plus size={13} aria-hidden="true" /> Add row
            </Button>
          </div>
        </div>

        {fileName && (
          <p className="m-0 text-[12.5px] text-ink-2">
            Loaded <strong className="text-ink">{fileName}</strong> ({rows.length}{" "}
            {rows.length === 1 ? "row" : "rows"}). Review auto-matched accounts below before committing.
          </p>
        )}

        {parseErr && (
          <p role="alert" className="m-0 text-[12.5px] text-negative">
            {parseErr}
          </p>
        )}

        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius)] border border-dashed border-border py-8 text-center text-[12.5px] text-muted">
            <p className="m-0">Upload a Trial Balance CSV above, or click “Add row” to key in balances directly.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius)] border border-border">
            <table className="w-full border-collapse text-[13px]" data-testid="migrate-rows">
              <thead className="bg-surface-2/60">
                <tr>
                  <th className="border-b border-border px-3 py-2 text-left text-[11px] font-medium uppercase tracking-[0.04em] text-muted">
                    Source account
                  </th>
                  <th className="border-b border-border px-3 py-2 text-left text-[11px] font-medium uppercase tracking-[0.04em] text-muted">
                    Kira account
                  </th>
                  <th className="border-b border-border px-3 py-2 text-right text-[11px] font-medium uppercase tracking-[0.04em] text-muted">
                    Debit (RM)
                  </th>
                  <th className="border-b border-border px-3 py-2 text-right text-[11px] font-medium uppercase tracking-[0.04em] text-muted">
                    Credit (RM)
                  </th>
                  <th className="border-b border-border px-2 py-2 text-right text-[11px] font-medium uppercase tracking-[0.04em] text-muted">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={r.key} className="border-t border-border">
                    <td className="px-3 py-2 align-middle">
                      {r.sourceCode || r.sourceName ? (
                        <div>
                          <div className="font-medium text-ink">
                            {r.sourceCode ? <span className="num mr-1.5 text-ink-2">{r.sourceCode}</span> : null}
                            {r.sourceName || "–"}
                          </div>
                          {r.matchedBy === "code" && <span className="text-[11px] text-positive">Matched by code</span>}
                          {r.matchedBy === "name" && <span className="text-[11px] text-brand">Suggested match</span>}
                          {!r.accountId && <span className="text-[11px] text-negative">Select an account</span>}
                        </div>
                      ) : (
                        <span className="text-[12px] text-muted">Manual row {idx + 1}</span>
                      )}
                    </td>
                    <td className="min-w-[240px] px-3 py-2 align-middle">
                      <Select
                        aria-label={`Row ${idx + 1} Kira account`}
                        value={r.accountId}
                        onChange={(e) => updateRow(r.key, { accountId: e.target.value, matchedBy: "manual" })}
                      >
                        <option value="">Choose account...</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} · {a.name}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="w-[140px] px-3 py-2 align-middle">
                      <Input
                        aria-label={`Row ${idx + 1} debit`}
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        className="text-right"
                        value={r.debit}
                        onChange={(e) => updateRow(r.key, { debit: e.target.value, ...(e.target.value ? { credit: "" } : {}) })}
                      />
                    </td>
                    <td className="w-[140px] px-3 py-2 align-middle">
                      <Input
                        aria-label={`Row ${idx + 1} credit`}
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        className="text-right"
                        value={r.credit}
                        onChange={(e) => updateRow(r.key, { credit: e.target.value, ...(e.target.value ? { debit: "" } : {}) })}
                      />
                    </td>
                    <td className="px-2 py-2 text-right align-middle">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`Remove row ${idx + 1}`}
                        onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                      >
                        <Trash2 size={13} aria-hidden="true" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Balance summary & P&L fold-in */}
        {rows.length > 0 && (
          <div className="flex flex-col gap-3 rounded-[var(--radius)] border border-border bg-surface-2/50 p-4 text-[13px]">
            <div className="flex flex-wrap items-center justify-between gap-3" data-testid="migrate-balance">
              <div className="flex flex-wrap items-center gap-4">
                <span>
                  Debits: <strong className="num-sans text-ink">{rm(summary.drSen)}</strong>
                </span>
                <span>
                  Credits: <strong className="num-sans text-ink">{rm(summary.crSen)}</strong>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {summary.unmapped > 0 && (
                  <span className="chip warn">
                    {summary.unmapped} unmapped {summary.unmapped === 1 ? "row" : "rows"}
                  </span>
                )}
                {summary.nonZero >= 2 && summary.diffSen === 0 ? (
                  <span className="chip pos">Balanced</span>
                ) : (
                  <span className="chip warn">Difference: {rm(Math.abs(summary.diffSen))}</span>
                )}
              </div>
            </div>

            <label className="inline-flex w-fit cursor-pointer items-center gap-2 text-[12.5px] font-medium text-ink">
              <input
                type="checkbox"
                className="accent-brand"
                checked={foldPnl}
                onChange={(e) => setFoldPnl(e.target.checked)}
              />
              Fold revenue &amp; expense balances into {retainedEarningsLabel}
            </label>
            {foldPnl && summary.pnlCount > 0 && (
              <p className="m-0 text-[12px] text-ink-2" data-testid="pnl-fold-preview">
                {summary.pnlCount} prior P&amp;L {summary.pnlCount === 1 ? "line" : "lines"} will fold into{" "}
                <strong>{retainedEarningsLabel}</strong> as a net{" "}
                <strong className="num-sans">
                  {summary.pnlNetSen <= 0 ? `credit of ${rm(-summary.pnlNetSen)}` : `debit of ${rm(summary.pnlNetSen)}`}
                </strong>
                .
              </p>
            )}
          </div>
        )}

        {/* 3. Cutover date & commit */}
        <div className="grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-[200px_1fr_auto] sm:items-end">
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="mig-date" className="text-[12.5px] font-medium text-ink-2">
              Cutover date<span className="ml-0.5 text-negative" aria-hidden="true">*</span>
            </label>
            <Input
              id="mig-date"
              type="date"
              min={openRange?.min}
              max={openRange?.max}
              value={cutoverDate}
              onChange={(e) => setCutoverDate(e.target.value)}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="mig-notes" className="text-[12.5px] font-medium text-ink-2">
              Notes (optional)
            </label>
            <Input
              id="mig-notes"
              placeholder="e.g. Closing trial balance"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div>
            <Button
              type="button"
              size="sm"
              className="h-[34px] w-full sm:w-auto"
              disabled={pending || !summary.ready}
              onClick={() => {
                setSubmitErr(null);
                setCommitted(null);
                start(async () => {
                  const r = await commitOpeningBalancesAction(orgSlug, {
                    sourceSystem: source,
                    cutoverDate,
                    foldPnl,
                    notes,
                    lines: rows
                      .filter((x) => (Number(x.debit) || 0) > 0 || (Number(x.credit) || 0) > 0)
                      .map((x) => ({
                        accountId: x.accountId,
                        debit: x.debit || "0",
                        credit: x.credit || "0",
                        description: x.sourceName
                          ? `Opening · ${x.sourceCode ? `${x.sourceCode} ` : ""}${x.sourceName}`
                          : undefined,
                      })),
                  });
                  if (r.ok) {
                    setCommitted({
                      journalEntryId: r.journalEntryId,
                      lineCount: r.lineCount,
                      totalAmount: r.totalAmount,
                    });
                    setRows([]);
                    setFileName(null);
                    setNotes("");
                    router.refresh();
                  } else {
                    setSubmitErr(r.error);
                  }
                });
              }}
            >
              {pending ? "Committing..." : "Commit opening balances"}
            </Button>
          </div>
        </div>

        {submitErr && (
          <p role="alert" className="m-0 text-[12.5px] text-negative">
            {submitErr}
          </p>
        )}

        {committed && (
          <p role="status" data-testid="migrate-committed" className="m-0 text-[13px] font-medium text-positive">
            Opening balances recorded: {committed.lineCount} lines in one opening entry (
            {rm(Math.round(committed.totalAmount * 100))}).{" "}
            <Link href={`/${orgSlug}/ledger/entries/${committed.journalEntryId}`} className="text-brand underline">
              View opening entry
            </Link>
          </p>
        )}
      </section>
    </div>
  );
}

export function ReverseMigrationButton({ orgSlug, id }: { orgSlug: string; id: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!confirm) {
    return (
      <Button type="button" size="sm" variant="ghost" onClick={() => setConfirm(true)}>
        Reverse
      </Button>
    );
  }
  return (
    <div className="inline-flex flex-col items-end gap-1">
      <div className="inline-flex items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => {
            setErr(null);
            start(async () => {
              const r = await reverseOpeningMigrationAction(orgSlug, id);
              if (r.ok) {
                setConfirm(false);
                router.refresh();
              } else {
                setErr(r.error);
              }
            });
          }}
        >
          {pending ? "Reversing..." : "Confirm reverse"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setConfirm(false)}>
          Cancel
        </Button>
      </div>
      {err && (
        <span role="alert" className="text-[11.5px] text-negative">
          {err}
        </span>
      )}
    </div>
  );
}
