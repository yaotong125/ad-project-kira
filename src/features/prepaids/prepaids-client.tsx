"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { rm } from "@/features/books/money";
import { Button } from "@/shared/ui/button";
import { Input, Select } from "@/shared/ui/form-controls";
import { cancelPrepaidAction, createPrepaidAction, postDuePrepaidsAction, postPrepaidLineAction } from "./actions";
import type { AccountChoice } from "./types";

export function PrepaidsControls({
  orgSlug,
  today,
  accounts,
}: {
  orgSlug: string;
  today: string;
  accounts: AccountChoice[];
}) {
  const router = useRouter();
  const assetAccts = useMemo(() => accounts.filter((a) => a.type === "asset" && !a.isCash), [accounts]);
  const expAccts = useMemo(() => accounts.filter((a) => a.type === "expense"), [accounts]);

  const defaultPrepaid = assetAccts.find((a) => a.code === "300-0500") ?? assetAccts[0];
  const defaultExpense = expAccts.find((a) => a.code === "800-1100") ?? expAccts[0];

  const [name, setName] = useState("");
  const [prepaidAccountId, setPrepaidAccountId] = useState(defaultPrepaid?.id ?? "");
  const [expenseAccountId, setExpenseAccountId] = useState(defaultExpense?.id ?? "");
  const [totalAmount, setTotalAmount] = useState("");
  const [periodsCount, setPeriodsCount] = useState("12");
  const [startDate, setStartDate] = useState(today);
  const [autoPost, setAutoPost] = useState(false);
  const [notes, setNotes] = useState("");
  const [formErr, setFormErr] = useState<string | null>(null);
  const [formOk, setFormOk] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const [asOf, setAsOf] = useState(today);
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const [runErr, setRunErr] = useState<string | null>(null);
  const [running, startRun] = useTransition();

  const perPeriodSen = useMemo(() => {
    const t = Number(totalAmount) || 0;
    const p = Number(periodsCount) || 0;
    if (t <= 0 || p < 2) return 0;
    return Math.round((t / p) * 100);
  }, [totalAmount, periodsCount]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
      <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-5">
        <h2 className="m-0 text-[14px] font-semibold text-ink">Set up a prepaid schedule</h2>
        <p className="m-0 mt-1 text-[12.5px] text-muted">
          Moves a prepaid cost into expense evenly across the months it covers; the final period absorbs any rounding.
        </p>

        <form
          className="mt-4 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setFormErr(null);
            setFormOk(null);
            startSave(async () => {
              const r = await createPrepaidAction(orgSlug, {
                name,
                prepaidAccountId,
                expenseAccountId,
                totalAmount,
                periodsCount,
                startDate,
                autoPost,
                notes,
              });
              if (r.ok) {
                setFormOk(`Created schedule "${name.trim()}".`);
                setName("");
                setTotalAmount("");
                setNotes("");
                router.refresh();
              } else {
                setFormErr(r.error);
              }
            });
          }}
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="pp-name" className="text-[12.5px] font-medium text-ink-2">
              Schedule name<span className="ml-0.5 text-negative" aria-hidden="true">*</span>
            </label>
            <Input
              id="pp-name"
              required
              placeholder="e.g. Annual office insurance 2026"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="pp-asset" className="text-[12.5px] font-medium text-ink-2">
                Prepaid asset account<span className="ml-0.5 text-negative" aria-hidden="true">*</span>
              </label>
              <Select
                id="pp-asset"
                required
                value={prepaidAccountId}
                onChange={(e) => setPrepaidAccountId(e.target.value)}
              >
                {assetAccts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="pp-exp" className="text-[12.5px] font-medium text-ink-2">
                Expense account<span className="ml-0.5 text-negative" aria-hidden="true">*</span>
              </label>
              <Select
                id="pp-exp"
                required
                value={expenseAccountId}
                onChange={(e) => setExpenseAccountId(e.target.value)}
              >
                {expAccts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="pp-total" className="text-[12.5px] font-medium text-ink-2">
                Total prepaid amount (RM)<span className="ml-0.5 text-negative" aria-hidden="true">*</span>
              </label>
              <Input
                id="pp-total"
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="pp-periods" className="text-[12.5px] font-medium text-ink-2">
                Periods (months)<span className="ml-0.5 text-negative" aria-hidden="true">*</span>
              </label>
              <Input
                id="pp-periods"
                type="number"
                min={2}
                max={120}
                required
                value={periodsCount}
                onChange={(e) => setPeriodsCount(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="pp-start" className="text-[12.5px] font-medium text-ink-2">
                First month<span className="ml-0.5 text-negative" aria-hidden="true">*</span>
              </label>
              <Input
                id="pp-start"
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="inline-flex w-fit cursor-pointer items-center gap-2 text-[13px] font-medium text-ink">
              <input
                type="checkbox"
                className="accent-brand"
                checked={autoPost}
                onChange={(e) => setAutoPost(e.target.checked)}
              />
              Auto-post due periods
            </label>
            <span className="text-[11.5px] text-muted">
              Leave off to confirm and post each period individually from the schedule page.
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
              <span className="text-muted">
                Per month: <strong className="num font-semibold text-ink">{rm(perPeriodSen)}</strong>
              </span>
              {formErr && (
                <span role="alert" className="text-negative">
                  {formErr}
                </span>
              )}
              {formOk && (
                <span role="status" className="font-medium text-positive">
                  {formOk}
                </span>
              )}
            </div>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Creating..." : "Create schedule"}
            </Button>
          </div>
        </form>
      </section>

      <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-5">
        <h2 className="m-0 text-[14px] font-semibold text-ink">Post due amortisations</h2>
        <p className="m-0 text-[12.5px] leading-relaxed text-muted">
          Posts all pending periods up to the chosen month-end for active schedules with auto-post turned on.
        </p>
        <div className="flex flex-col gap-1">
          <label htmlFor="pp-as-of" className="text-[12.5px] font-medium text-ink-2">
            Through month
          </label>
          <Input id="pp-as-of" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </div>
        <div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={running}
            onClick={() => {
              setRunMsg(null);
              setRunErr(null);
              startRun(async () => {
                const r = await postDuePrepaidsAction(orgSlug, asOf);
                if (r.ok) {
                  setRunMsg(
                    `Posted ${r.posted} ${r.posted === 1 ? "period" : "periods"} (${rm(Math.round(r.amount * 100))})${r.skipped > 0 ? `, ${r.skipped} skipped` : ""}.`,
                  );
                  router.refresh();
                } else {
                  setRunErr(r.error);
                }
              });
            }}
          >
            {running ? "Posting..." : "Post due now"}
          </Button>
        </div>
        {runMsg && (
          <p role="status" className="m-0 text-[12.5px] font-medium text-positive" data-testid="prepaid-run-result">
            {runMsg}
          </p>
        )}
        {runErr && (
          <p role="alert" className="m-0 text-[12.5px] text-negative">
            {runErr}
          </p>
        )}
      </section>
    </div>
  );
}

export function PostPrepaidLineButton({
  orgSlug,
  scheduleId,
  lineId,
}: {
  orgSlug: string;
  scheduleId: string;
  lineId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="inline-flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() => {
          setError(null);
          start(async () => {
            const r = await postPrepaidLineAction(orgSlug, scheduleId, lineId);
            if (r.ok) router.refresh();
            else setError(r.error);
          });
        }}
      >
        {pending ? "Posting..." : "Post"}
      </Button>
      {error && (
        <span role="alert" className="text-[11.5px] text-negative">
          {error}
        </span>
      )}
    </div>
  );
}

export function CancelPrepaidButton({ orgSlug, id }: { orgSlug: string; id: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-1.5">
      <div>
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => {
            setError(null);
            start(async () => {
              const r = await cancelPrepaidAction(orgSlug, id);
              if (r.ok) router.refresh();
              else setError(r.error);
            });
          }}
        >
          {pending ? "Cancelling..." : "Cancel remaining periods"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="m-0 text-[12.5px] text-negative">
          {error}
        </p>
      )}
    </div>
  );
}
