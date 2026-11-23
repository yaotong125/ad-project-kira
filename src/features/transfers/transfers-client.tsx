"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/shared/ui/button";
import { Input, Select } from "@/shared/ui/form-controls";
import { recordTransferAction, voidTransferAction } from "./actions";
import type { CashAccountOpt } from "./types";

export function NewTransferPanel({
  orgSlug,
  today,
  initialOpen,
  cashAccounts,
}: {
  orgSlug: string;
  today: string;
  initialOpen: boolean;
  cashAccounts: CashAccountOpt[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(initialOpen);
  const [fromId, setFromId] = useState(cashAccounts[0]?.id ?? "");
  const [toId, setToId] = useState(cashAccounts[1]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("");
  const [date, setDate] = useState(today);
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {okMsg ? (
          <p role="status" className="m-0 text-[13px] font-medium text-positive">
            {okMsg}
          </p>
        ) : (
          <span />
        )}
        {!open && (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setOkMsg(null);
              setError(null);
              setOpen(true);
            }}
          >
            Transfer
          </Button>
        )}
      </div>

      {open && (
        <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="m-0 text-[14px] font-semibold text-ink">New transfer</h2>
              <p className="m-0 mt-1 text-[12.5px] text-muted">
                Both accounts must be bank or cash accounts, and they must be different.
              </p>
            </div>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>

          {cashAccounts.length < 2 ? (
            <p className="mt-4 text-[13px] text-muted">
              Add at least two active bank or cash accounts under Chart of accounts before recording a transfer.
            </p>
          ) : (
            <form
              className="mt-4 flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                setOkMsg(null);
                start(async () => {
                  const r = await recordTransferAction(orgSlug, {
                    fromAccountId: fromId,
                    toAccountId: toId,
                    amount,
                    fee: fee.trim() || "0",
                    transferDate: date,
                    reference,
                  });
                  if (r.ok) {
                    setOkMsg(`Recorded transfer ${r.number}.`);
                    setAmount("");
                    setFee("");
                    setReference("");
                    setOpen(false);
                    router.refresh();
                  } else {
                    setError(r.error);
                  }
                });
              }}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label htmlFor="trf-from" className="text-[12.5px] font-medium text-ink-2">
                    From account<span className="ml-0.5 text-negative" aria-hidden="true">*</span>
                  </label>
                  <Select id="trf-from" required value={fromId} onChange={(e) => setFromId(e.target.value)}>
                    <option value="">Pick an account</option>
                    {cashAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} · {a.name}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="trf-to" className="text-[12.5px] font-medium text-ink-2">
                    To account<span className="ml-0.5 text-negative" aria-hidden="true">*</span>
                  </label>
                  <Select id="trf-to" required value={toId} onChange={(e) => setToId(e.target.value)}>
                    <option value="">Pick an account</option>
                    {cashAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} · {a.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor="trf-amount" className="text-[12.5px] font-medium text-ink-2">
                    Amount (MYR)<span className="ml-0.5 text-negative" aria-hidden="true">*</span>
                  </label>
                  <Input
                    id="trf-amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="trf-date" className="text-[12.5px] font-medium text-ink-2">
                    Transfer date<span className="ml-0.5 text-negative" aria-hidden="true">*</span>
                  </label>
                  <Input id="trf-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="trf-fee" className="text-[12.5px] font-medium text-ink-2">
                    Bank charges (MYR)
                  </label>
                  <Input
                    id="trf-fee"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={fee}
                    onChange={(e) => setFee(e.target.value)}
                  />
                  <span className="text-[11px] text-muted">
                    Optional. Taken from the source account and recorded as Bank Charges.
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="trf-ref" className="text-[12.5px] font-medium text-ink-2">
                  Reference
                </label>
                <Input
                  id="trf-ref"
                  placeholder="Optional. For example the bank reference number."
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                {error ? (
                  <p role="alert" className="m-0 text-[12.5px] text-negative">
                    {error}
                  </p>
                ) : (
                  <span />
                )}
                <Button type="submit" size="sm" disabled={pending}>
                  {pending ? "Recording..." : "Record"}
                </Button>
              </div>
            </form>
          )}
        </section>
      )}
    </div>
  );
}

export function VoidTransferControl({
  orgSlug,
  id,
  transferDate,
  today,
}: {
  orgSlug: string;
  id: string;
  transferDate: string;
  today: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(today < transferDate ? transferDate : today);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Void
      </Button>
    );
  }
  return (
    <div className="flex max-w-md flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4" data-testid="void-transfer-panel">
      <div className="flex flex-col gap-1">
        <label htmlFor="void-trf-reason" className="text-[12.5px] font-medium text-ink-2">
          Reason for voiding
        </label>
        <Input
          id="void-trf-reason"
          aria-label="Void transfer reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          autoFocus
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="void-trf-date" className="text-[12.5px] font-medium text-ink-2">
          Void date
        </label>
        <Input id="void-trf-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <span className="text-[11.5px] text-muted">
          The reversal is dated on the void date, or on the transfer date if that is later.
        </span>
      </div>
      {error && (
        <p role="alert" className="m-0 text-[12.5px] text-negative">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() => {
            setError(null);
            start(async () => {
              const r = await voidTransferAction(orgSlug, id, date, reason);
              if (r.ok) {
                setOpen(false);
                router.refresh();
              } else {
                setError(r.error);
              }
            });
          }}
        >
          {pending ? "Voiding..." : "Confirm void"}
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
