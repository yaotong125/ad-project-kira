"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";
import { rm } from "@/features/books/money";
import type { Lang } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";
import { Input, Select } from "@/shared/ui/form-controls";
import { recordVoucherAction, voidVoucherAction } from "./actions";
import type { AnyAccountOpt, CashAccountOpt, VoucherKind, VoucherRow } from "./types";

const TH = "border-b border-border px-[var(--pad-x)] py-2 text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted";
const TD = "h-[var(--row-h)] border-b border-border px-[var(--pad-x)] align-middle";

type LineDraft = { accountInput: string; description: string; amount: string };

function parseCode(raw: string, accounts: AnyAccountOpt[]): string {
  const t = raw.trim();
  const hit = accounts.find((a) => a.code === t || `${a.code} · ${a.name}` === t);
  if (hit) return hit.code;
  return t.split("·")[0]?.trim() ?? t;
}

export function VouchersClient({
  orgSlug,
  kind,
  lang,
  today,
  suggestedNumber,
  canEdit,
  initialOpen,
  cashAccounts,
  accounts,
  vouchers,
}: {
  orgSlug: string;
  kind: VoucherKind;
  lang: Lang;
  today: string;
  suggestedNumber: string;
  canEdit: boolean;
  initialOpen: boolean;
  cashAccounts: CashAccountOpt[];
  accounts: AnyAccountOpt[];
  vouchers: VoucherRow[];
}) {
  const router = useRouter();
  const base = `/${orgSlug}`;
  const ms = lang === "ms";
  const isOr = kind === "official_receipt";
  const accountListId = useId();

  const [open, setOpen] = useState(initialOpen || vouchers.length === 0);
  const [editId, setEditId] = useState<string | null>(null);
  const [partyName, setPartyName] = useState("");
  const [number, setNumber] = useState(suggestedNumber);
  const [date, setDate] = useState(today);
  const [cashAccountId, setCashAccountId] = useState(cashAccounts[0]?.id ?? "");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([{ accountInput: "", description: "", amount: "" }]);

  const [formErr, setFormErr] = useState<string | null>(null);
  const [formOk, setFormOk] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const [showVoid, setShowVoid] = useState(false);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidDate, setVoidDate] = useState(today);
  const [voidErr, setVoidErr] = useState<string | null>(null);
  const [voidPending, startVoid] = useTransition();

  const totalSen = useMemo(
    () => lines.reduce((s, l) => s + Math.max(0, Math.round((Number(l.amount) || 0) * 100)), 0),
    [lines],
  );

  const visibleVouchers = useMemo(
    () => (showVoid ? vouchers : vouchers.filter((v) => v.status !== "void")),
    [vouchers, showVoid],
  );

  const resetForm = () => {
    setEditId(null);
    setPartyName("");
    setNumber(suggestedNumber);
    setDate(today);
    setCashAccountId(cashAccounts[0]?.id ?? "");
    setNotes("");
    setLines([{ accountInput: "", description: "", amount: "" }]);
    setFormErr(null);
  };

  const startEdit = (v: VoucherRow) => {
    setEditId(v.id);
    setPartyName(v.partyName);
    setNumber(suggestedNumber);
    setDate(v.date);
    setCashAccountId(v.cashAccountId);
    setNotes(v.notes);
    setLines(
      v.lines.length > 0
        ? v.lines.map((l) => ({
            accountInput: l.accountCode ? `${l.accountCode} · ${l.accountName}` : "",
            description: l.description,
            amount: l.amount,
          }))
        : [{ accountInput: "", description: "", amount: "" }],
    );
    setFormErr(null);
    setFormOk(null);
    setOpen(true);
  };

  return (
    <div className="flex flex-col gap-6">
      {canEdit && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {formOk ? (
            <p role="status" className="m-0 text-[13px] font-medium text-positive">
              {formOk}
            </p>
          ) : (
            <span />
          )}
          {!open && (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                resetForm();
                setFormOk(null);
                setOpen(true);
              }}
            >
              {isOr
                ? ms
                  ? "Resit rasmi baharu"
                  : "New official receipt"
                : ms
                  ? "Baucar bayaran baharu"
                  : "New payment voucher"}
            </Button>
          )}
        </div>
      )}

      {canEdit && open && (
        <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="m-0 text-[14px] font-semibold text-ink">
                {editId
                  ? isOr
                    ? "Edit official receipt"
                    : "Edit payment voucher"
                  : isOr
                    ? "Record an official receipt"
                    : "Record a payment voucher"}
              </h2>
              <p className="m-0 mt-1 max-w-prose text-[12.5px] text-muted">
                {isOr
                  ? "For money received straight into cash or bank, with no customer invoice to track. The amount goes into the cash or bank account you pick, and each line records what the money was for. For a customer settling an invoice, use Payments received instead."
                  : "For money paid straight from cash or bank, with no supplier invoice to track. Each line records what you spent the money on, and the total comes out of the cash or bank account you paid from. For a supplier you will pay later, raise a bill instead."}
              </p>
            </div>
            {vouchers.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  resetForm();
                  setOpen(false);
                }}
              >
                {ms ? "Tutup" : "Close"}
              </Button>
            )}
          </div>

          {editId && (
            <p className="mt-3 rounded border border-warning/40 bg-warning-soft px-3 py-2 text-[12.5px] text-ink-2">
              <strong>Editing this entry</strong> voids the original and posts a new one. The change is recorded in the
              ledger history.
            </p>
          )}

          {cashAccounts.length === 0 ? (
            <p className="mt-4 text-[13px] text-muted">
              {isOr
                ? "Add a cash or bank account to the chart of accounts before recording receipts."
                : "Add a cash or bank account to the chart of accounts before recording a voucher."}
            </p>
          ) : (
            <form
              className="mt-4 flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                setFormErr(null);
                setFormOk(null);
                startSave(async () => {
                  const r = await recordVoucherAction(orgSlug, {
                    kind,
                    editId,
                    date,
                    number,
                    partyName,
                    cashAccountId,
                    notes,
                    lines: lines.map((l) => ({
                      accountCode: parseCode(l.accountInput, accounts),
                      description: l.description,
                      amount: l.amount,
                    })),
                  });
                  if (r.ok) {
                    setFormOk(
                      editId
                        ? isOr
                          ? `Official receipt updated (${r.number}).`
                          : `Payment voucher updated (${r.number}).`
                        : isOr
                          ? `Official receipt recorded (${r.number}).`
                          : `Payment voucher recorded (${r.number}).`,
                    );
                    resetForm();
                    setOpen(false);
                    router.refresh();
                  } else {
                    setFormErr(r.error);
                  }
                });
              }}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="flex flex-col gap-1">
                  <label htmlFor="v-party" className="text-[12.5px] font-medium text-ink-2">
                    {isOr ? "Received from" : "Pay to"}
                  </label>
                  <Input
                    id="v-party"
                    placeholder={isOr ? "Payer name" : "Payee name"}
                    value={partyName}
                    onChange={(e) => setPartyName(e.target.value)}
                  />
                  <span className="text-[11px] text-muted">{isOr ? "Who paid you" : "Who you are paying"}</span>
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="v-number" className="text-[12.5px] font-medium text-ink-2">
                    {isOr ? "Receipt number" : "Voucher number"}
                  </label>
                  <Input
                    id="v-number"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    placeholder={suggestedNumber}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="v-date" className="text-[12.5px] font-medium text-ink-2">
                    Date<span className="ml-0.5 text-negative" aria-hidden="true">*</span>
                  </label>
                  <Input id="v-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="v-cash" className="text-[12.5px] font-medium text-ink-2">
                    {isOr ? "Deposit to" : "Paid from"}
                    <span className="ml-0.5 text-negative" aria-hidden="true">*</span>
                  </label>
                  <Select
                    id="v-cash"
                    required
                    value={cashAccountId}
                    onChange={(e) => setCashAccountId(e.target.value)}
                  >
                    {cashAccounts.map((ca) => (
                      <option key={ca.id} value={ca.id}>
                        {ca.code} · {ca.name}
                      </option>
                    ))}
                  </Select>
                  <span className="text-[11px] text-muted">Cash or bank account</span>
                </div>
              </div>

              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] font-semibold text-ink">Lines</span>
                  <span className="num text-[13px] text-muted">
                    Total: <strong className="font-semibold text-ink">{rm(totalSen)}</strong>
                  </span>
                </div>
                <datalist id={accountListId}>
                  {accounts
                    .filter((a) => a.id !== cashAccountId)
                    .map((a) => (
                      <option key={a.id} value={`${a.code} · ${a.name}`} />
                    ))}
                </datalist>

                {lines.map((l, idx) => (
                  <div key={idx} className="grid grid-cols-1 gap-2 sm:grid-cols-12 sm:items-center">
                    <div className="sm:col-span-4">
                      <Input
                        aria-label={`Line ${idx + 1} account`}
                        list={accountListId}
                        required
                        placeholder="Find any account..."
                        value={l.accountInput}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((row, i) => (i === idx ? { ...row, accountInput: e.target.value } : row)),
                          )
                        }
                      />
                    </div>
                    <div className="sm:col-span-5">
                      <Input
                        aria-label={`Line ${idx + 1} description`}
                        placeholder="Description (optional)"
                        value={l.description}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((row, i) => (i === idx ? { ...row, description: e.target.value } : row)),
                          )
                        }
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Input
                        aria-label={`Line ${idx + 1} amount`}
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        placeholder="0.00"
                        value={l.amount}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((row, i) => (i === idx ? { ...row, amount: e.target.value } : row)),
                          )
                        }
                      />
                    </div>
                    <div className="flex justify-end sm:col-span-1">
                      {lines.length > 1 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                ))}

                <div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setLines((prev) => [...prev, { accountInput: "", description: "", amount: "" }])}
                  >
                    Add line
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="v-notes" className="text-[12.5px] font-medium text-ink-2">
                  Notes
                </label>
                <Input
                  id="v-notes"
                  placeholder="What was it for?"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
                <span className="text-[11px] text-muted">Optional</span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                {formErr ? (
                  <p role="alert" className="m-0 text-[12.5px] text-negative">
                    {formErr}
                  </p>
                ) : (
                  <span />
                )}
                <Button type="submit" size="sm" disabled={saving}>
                  {saving
                    ? editId
                      ? "Saving..."
                      : "Recording..."
                    : editId
                      ? "Save changes"
                      : isOr
                        ? "Record official receipt"
                        : "Record payment voucher"}
                </Button>
              </div>
            </form>
          )}
        </section>
      )}

      {/* Register table */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 text-[14px] font-semibold text-ink">
            {isOr ? "Recorded official receipts" : "Recorded payment vouchers"}
          </h2>
          <label className="inline-flex cursor-pointer items-center gap-2 text-[12.5px] text-ink-2">
            <input
              type="checkbox"
              className="accent-brand"
              checked={showVoid}
              onChange={(e) => setShowVoid(e.target.checked)}
            />
            {ms ? "Papar transaksi dibatalkan" : "Show voided"}
          </label>
        </div>

        {visibleVouchers.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 rounded-[var(--radius-lg)] border border-dashed border-border py-10 text-center">
            <p className="m-0 text-[13.5px] font-medium text-ink">
              {vouchers.length === 0
                ? isOr
                  ? "No official receipts recorded yet"
                  : "No payment vouchers recorded yet"
                : isOr
                  ? "No official receipts in this view"
                  : "No payment vouchers in this view"}
            </p>
            <p className="m-0 text-[12.5px] text-muted">
              {isOr
                ? "Money received straight into cash or bank — no invoice to track."
                : "Money paid straight from cash or bank — no supplier bill to track."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
            <table className="w-full border-collapse text-[13px]" data-testid="vouchers-table">
              <thead className="bg-surface">
                <tr>
                  <th className={cn(TH, "text-left")}>Date</th>
                  <th className={cn(TH, "text-left")}>{isOr ? "Receipt no." : "Voucher no."}</th>
                  <th className={cn(TH, "text-left")}>{isOr ? "Received from" : "Pay to"}</th>
                  <th className={cn(TH, "text-left")}>Notes</th>
                  <th className={cn(TH, "text-right")}>Amount</th>
                  <th className={cn(TH, "text-left")}>Status</th>
                  <th className={cn(TH, "text-right")}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleVouchers.map((v) => {
                  const isVoid = v.status === "void";
                  const isVoidingThis = voidingId === v.id;
                  return (
                    <tr
                      key={v.id}
                      className={cn(
                        "border-t border-border align-top transition-colors hover:bg-surface-2",
                        isVoid && "text-muted",
                      )}
                    >
                      <td className={cn(TD, "num whitespace-nowrap py-2 text-ink-2")}>{v.date}</td>
                      <td className={cn(TD, "whitespace-nowrap py-2")}>
                        {v.journalEntryId ? (
                          <Link
                            href={`${base}/ledger/entries/${v.journalEntryId}`}
                            className="num font-medium text-ink hover:underline"
                          >
                            {v.number}
                          </Link>
                        ) : (
                          <span className="num font-medium text-ink">{v.number}</span>
                        )}
                      </td>
                      <td className={cn(TD, "py-2")}>
                        <div className={isVoid ? "text-muted" : "text-ink"}>{v.partyName || "-"}</div>
                        <div className="text-[11.5px] text-muted">{v.cashAccountLabel}</div>
                      </td>
                      <td className={cn(TD, "py-2 text-ink-2")}>
                        <div>{v.notes || v.lines.map((l) => l.description || l.accountName).filter(Boolean).join(", ") || "-"}</div>
                        {isVoid && v.voidReason && (
                          <div className="text-[11.5px] text-muted">
                            Void ({v.voidedOn}): {v.voidReason}
                          </div>
                        )}
                      </td>
                      <td className={cn(TD, "num-sans whitespace-nowrap py-2 text-right", isVoid ? "line-through" : "text-ink")}>
                        {rm(v.totalSen)}
                      </td>
                      <td className={cn(TD, "whitespace-nowrap py-2")}>
                        <span className={isVoid ? "chip" : "chip pos"}>{isVoid ? "Voided" : "Recorded"}</span>
                      </td>
                      <td className={cn(TD, "py-1.5 text-right")}>
                        {canEdit && !isVoid && !isVoidingThis && (
                          <div className="inline-flex items-center gap-1">
                            <Button size="sm" variant="ghost" onClick={() => startEdit(v)}>
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setVoidingId(v.id);
                                setVoidReason("");
                                setVoidDate(today < v.date ? v.date : today);
                                setVoidErr(null);
                              }}
                            >
                              Void
                            </Button>
                          </div>
                        )}
                        {canEdit && isVoidingThis && (
                          <div className="ml-auto flex w-64 flex-col gap-1.5 text-left">
                            <Input
                              type="date"
                              aria-label="Void date"
                              min={v.date}
                              value={voidDate}
                              onChange={(e) => setVoidDate(e.target.value)}
                            />
                            <Input
                              aria-label="Void reason"
                              placeholder="Reason for voiding"
                              value={voidReason}
                              onChange={(e) => setVoidReason(e.target.value)}
                              autoFocus
                            />
                            <div className="flex gap-1.5">
                              <Button
                                size="sm"
                                disabled={voidPending}
                                onClick={() => {
                                  setVoidErr(null);
                                  startVoid(async () => {
                                    const r = await voidVoucherAction(orgSlug, kind, v.id, voidDate, voidReason);
                                    if (r.ok) {
                                      setVoidingId(null);
                                      router.refresh();
                                    } else {
                                      setVoidErr(r.error);
                                    }
                                  });
                                }}
                              >
                                {voidPending ? "Voiding..." : "Confirm void"}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={voidPending}
                                onClick={() => {
                                  setVoidingId(null);
                                  setVoidErr(null);
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                            {voidErr && (
                              <p role="alert" className="m-0 text-[12px] text-negative">
                                {voidErr}
                              </p>
                            )}
                          </div>
                        )}
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
