"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { rm } from "@/features/books/money";
import { Button } from "@/shared/ui/button";
import { Input, Select } from "@/shared/ui/form-controls";
import { createFixedAssetAction, disposeFixedAssetAction, runDepreciationAction } from "./actions";
import type { AssetAccountOpt } from "./types";

export function FixedAssetsControls({
  orgSlug,
  today,
  accounts,
}: {
  orgSlug: string;
  today: string;
  accounts: AssetAccountOpt[];
}) {
  const router = useRouter();

  const fixedAssetAccts = useMemo(
    () =>
      accounts.filter(
        (a) =>
          a.type === "asset" &&
          !a.isCash &&
          a.normalBalance === "debit" &&
          (a.subtype === "non_current" || a.code.startsWith("200-")),
      ),
    [accounts],
  );
  const accumDepAccts = useMemo(
    () =>
      accounts.filter(
        (a) =>
          (a.type === "asset" && a.normalBalance === "credit") ||
          a.type === "contra_asset" ||
          a.name.toLowerCase().includes("accumulated depreciation"),
      ),
    [accounts],
  );
  const depExpenseAccts = useMemo(() => accounts.filter((a) => a.type === "expense"), [accounts]);

  const defaultAsset = fixedAssetAccts.find((a) => a.code === "200-0300") ?? fixedAssetAccts[0];
  const pairedAccum = (assetId: string) =>
    accumDepAccts.find((a) => a.parentId === assetId) ?? accumDepAccts[0];
  const defaultExp =
    depExpenseAccts.find((a) => a.code === "800-2400") ??
    depExpenseAccts.find((a) => a.code === "800-2300") ??
    depExpenseAccts[0];

  const [assetCode, setAssetCode] = useState("");
  const [name, setName] = useState("");
  const [assetAccountId, setAssetAccountId] = useState(defaultAsset?.id ?? "");
  const [accumDepAccountId, setAccumDepAccountId] = useState(
    (defaultAsset ? pairedAccum(defaultAsset.id)?.id : accumDepAccts[0]?.id) ?? "",
  );
  const [depExpenseAccountId, setDepExpenseAccountId] = useState(defaultExp?.id ?? "");
  const [purchaseDate, setPurchaseDate] = useState(today);
  const [depreciationStart, setDepreciationStart] = useState(today);
  const [cost, setCost] = useState("");
  const [residualValue, setResidualValue] = useState("0");
  const [usefulLifeMonths, setUsefulLifeMonths] = useState("36");
  const [notes, setNotes] = useState("");
  const [formErr, setFormErr] = useState<string | null>(null);
  const [formOk, setFormOk] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const [asOf, setAsOf] = useState(today);
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const [runErr, setRunErr] = useState<string | null>(null);
  const [running, startRun] = useTransition();

  const monthlyPreview = useMemo(() => {
    const c = Number(cost) || 0;
    const r = Number(residualValue) || 0;
    const m = Number(usefulLifeMonths) || 0;
    if (c <= r || m < 1) return 0;
    return Math.round(((c - r) / m) * 100);
  }, [cost, residualValue, usefulLifeMonths]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
      <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-5">
        <h2 className="m-0 text-[14px] font-semibold text-ink">Register a fixed asset</h2>
        <p className="m-0 mt-1 text-[12.5px] text-muted">
          Track equipment, vehicles, or property and depreciate their cost straight-line each month.
        </p>

        <form
          className="mt-4 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setFormErr(null);
            setFormOk(null);
            startSave(async () => {
              const r = await createFixedAssetAction(orgSlug, {
                assetCode,
                name,
                assetAccountId,
                accumDepAccountId,
                depExpenseAccountId,
                purchaseDate,
                depreciationStart: depreciationStart || purchaseDate,
                cost,
                residualValue: residualValue || "0",
                usefulLifeMonths,
                notes,
              });
              if (r.ok) {
                setFormOk(`Registered "${name.trim()}".`);
                setAssetCode("");
                setName("");
                setCost("");
                setResidualValue("0");
                setNotes("");
                router.refresh();
              } else {
                setFormErr(r.error);
              }
            });
          }}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label htmlFor="fa-name" className="text-[12.5px] font-medium text-ink-2">
                Asset name<span className="ml-0.5 text-negative" aria-hidden="true">*</span>
              </label>
              <Input
                id="fa-name"
                required
                placeholder="e.g. MacBook Pro 16-inch"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="fa-code" className="text-[12.5px] font-medium text-ink-2">
                Asset code
              </label>
              <Input
                id="fa-code"
                placeholder="Auto (e.g. FA-001)"
                value={assetCode}
                onChange={(e) => setAssetCode(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="fa-acct" className="truncate text-[12.5px] font-medium text-ink-2">
                Asset account<span className="ml-0.5 text-negative" aria-hidden="true">*</span>
              </label>
              <Select
                id="fa-acct"
                required
                value={assetAccountId}
                onChange={(e) => {
                  const id = e.target.value;
                  setAssetAccountId(id);
                  const pair = pairedAccum(id);
                  if (pair) setAccumDepAccountId(pair.id);
                }}
              >
                {fixedAssetAccts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="fa-accum" className="truncate text-[12.5px] font-medium text-ink-2">
                Accumulated depreciation<span className="ml-0.5 text-negative" aria-hidden="true">*</span>
              </label>
              <Select
                id="fa-accum"
                required
                value={accumDepAccountId}
                onChange={(e) => setAccumDepAccountId(e.target.value)}
              >
                {accumDepAccts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="fa-exp" className="truncate text-[12.5px] font-medium text-ink-2">
                Depreciation expense<span className="ml-0.5 text-negative" aria-hidden="true">*</span>
              </label>
              <Select
                id="fa-exp"
                required
                value={depExpenseAccountId}
                onChange={(e) => setDepExpenseAccountId(e.target.value)}
              >
                {depExpenseAccts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
            <div className="flex flex-col gap-1">
              <label htmlFor="fa-pdate" className="text-[12.5px] font-medium text-ink-2">
                Purchase date<span className="ml-0.5 text-negative" aria-hidden="true">*</span>
              </label>
              <Input
                id="fa-pdate"
                type="date"
                required
                value={purchaseDate}
                onChange={(e) => {
                  setPurchaseDate(e.target.value);
                  setDepreciationStart(e.target.value);
                }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="fa-sdate" className="text-[12.5px] font-medium text-ink-2">
                Depreciate from
              </label>
              <Input
                id="fa-sdate"
                type="date"
                required
                value={depreciationStart}
                onChange={(e) => setDepreciationStart(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="fa-cost" className="text-[12.5px] font-medium text-ink-2">
                Cost (RM)<span className="ml-0.5 text-negative" aria-hidden="true">*</span>
              </label>
              <Input
                id="fa-cost"
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="fa-res" className="text-[12.5px] font-medium text-ink-2">
                Residual (RM)
              </label>
              <Input
                id="fa-res"
                type="number"
                step="0.01"
                min="0"
                value={residualValue}
                onChange={(e) => setResidualValue(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="fa-life" className="text-[12.5px] font-medium text-ink-2">
                Life (months)<span className="ml-0.5 text-negative" aria-hidden="true">*</span>
              </label>
              <Input
                id="fa-life"
                type="number"
                min={1}
                max={600}
                required
                value={usefulLifeMonths}
                onChange={(e) => setUsefulLifeMonths(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
              <span className="text-muted">
                Straight-line: <strong className="num font-semibold text-ink">{rm(monthlyPreview)}</strong> / month
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
              {saving ? "Saving..." : "Add fixed asset"}
            </Button>
          </div>
        </form>
      </section>

      <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-5">
        <h2 className="m-0 text-[14px] font-semibold text-ink">Run depreciation</h2>
        <p className="m-0 text-[12.5px] leading-relaxed text-muted">
          Posts one balanced straight-line entry per unposted month up to the chosen month-end, without double-posting.
          Fully depreciated assets retire automatically.
        </p>
        <div className="flex flex-col gap-1">
          <label htmlFor="dep-as-of" className="text-[12.5px] font-medium text-ink-2">
            Through month
          </label>
          <Input id="dep-as-of" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
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
                const r = await runDepreciationAction(orgSlug, asOf);
                if (r.ok) {
                  setRunMsg(
                    `Evaluated ${r.assets} ${r.assets === 1 ? "asset" : "assets"}: posted ${r.posted} ${r.posted === 1 ? "entry" : "entries"} (${rm(Math.round(r.amount * 100))})${r.skipped > 0 ? `, ${r.skipped} skipped (closed period)` : ""}.`,
                  );
                  router.refresh();
                } else {
                  setRunErr(r.error);
                }
              });
            }}
          >
            {running ? "Posting..." : "Post due depreciation"}
          </Button>
        </div>
        {runMsg && (
          <p role="status" className="m-0 text-[12.5px] font-medium text-positive" data-testid="dep-result">
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

export function DisposeAssetControl({
  orgSlug,
  id,
  purchaseDate,
  today,
  cashAccounts,
}: {
  orgSlug: string;
  id: string;
  purchaseDate: string;
  today: string;
  cashAccounts: { id: string; code: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today < purchaseDate ? purchaseDate : today);
  const [proceeds, setProceeds] = useState("0");
  const [cashId, setCashId] = useState(cashAccounts[0]?.id ?? "");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Dispose asset
      </Button>
    );
  }
  return (
    <div className="flex max-w-lg flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4" data-testid="dispose-panel">
      <p className="m-0 text-[12.5px] text-muted">
        Clears the asset&apos;s cost and accumulated depreciation from the balance sheet and posts any gain or loss to
        900-0400.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="disp-date" className="text-[12.5px] font-medium text-ink-2">
            Disposal date
          </label>
          <Input id="disp-date" type="date" min={purchaseDate} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="disp-proc" className="text-[12.5px] font-medium text-ink-2">
            Proceeds (RM)
          </label>
          <Input
            id="disp-proc"
            type="number"
            step="0.01"
            min="0"
            value={proceeds}
            onChange={(e) => setProceeds(e.target.value)}
          />
        </div>
      </div>
      {Number(proceeds || 0) > 0 && (
        <div className="flex flex-col gap-1">
          <label htmlFor="disp-cash" className="text-[12.5px] font-medium text-ink-2">
            Received into
          </label>
          <Select id="disp-cash" value={cashId} onChange={(e) => setCashId(e.target.value)}>
            {cashAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} · {a.name}
              </option>
            ))}
          </Select>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor="disp-notes" className="text-[12.5px] font-medium text-ink-2">
          Notes
        </label>
        <Input id="disp-notes" placeholder="e.g. Sold or scrapped" value={notes} onChange={(e) => setNotes(e.target.value)} />
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
              const r = await disposeFixedAssetAction(orgSlug, id, date, proceeds, cashId, notes);
              if (r.ok) {
                setOpen(false);
                router.refresh();
              } else {
                setError(r.error);
              }
            });
          }}
        >
          {pending ? "Disposing..." : "Confirm disposal"}
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
