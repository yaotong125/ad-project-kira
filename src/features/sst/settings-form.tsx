"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/shared/ui/button";
import { Input, Select } from "@/shared/ui/form-controls";
import { saveSstFilingAction, saveSstLockAction } from "./actions";
import { previewYear, type SstCadence } from "./periods";

const LABEL = "text-[13px] font-medium text-ink-2";

/** Settings → Tax & e-Invois → SST filing (lejar.ai, observed 2026-11-22). Owner-only edits. */
export function SstSettingsForm(props: {
  slug: string;
  canEdit: boolean;
  fyeMonth: number;
  today: string;
  cadence: SstCadence | null;
  registeredOn: string;
  lockedUntil: string;
}) {
  const router = useRouter();
  const [cadence, setCadence] = useState<SstCadence>(props.cadence ?? "bimonthly");
  const [registeredOn, setRegisteredOn] = useState(props.registeredOn);
  const [lock, setLock] = useState(props.lockedUntil);
  const [filing, setFiling] = useState<{ ok: boolean; text: string } | null>(null);
  const [lockMsg, setLockMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [locking, setLocking] = useState(false);
  const [, start] = useTransition();
  const yesterday = new Date(Date.parse(`${props.today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

  return (
    <>
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-[13.5px] font-semibold text-ink">SST-02 filing periods</h2>
          <p className="mt-1 max-w-prose text-[12.5px] text-muted">
            Malaysian SST-02 returns default to a bi-monthly taxable period (Sales Tax Act 2018 s.25(1); Service Tax Act 2018 s.25(1)). Which two months pair
            together follows your financial year end. Leave this unconfigured to keep grouping returns by your bookkeeping periods instead.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              setFiling(null);
              setSaving(true);
              void (async () => {
                const r = await saveSstFilingAction(props.slug, cadence, registeredOn);
                setSaving(false);
                setFiling(r.ok ? { ok: true, text: "SST filing settings saved." } : { ok: false, text: r.error });
                if (r.ok) start(() => router.refresh());
              })();
            }}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="cadence" className={LABEL}>
                  Filing cadence
                </label>
                <Select id="cadence" name="cadence" value={cadence} disabled={!props.canEdit} onChange={(e) => setCadence(e.target.value as SstCadence)}>
                  <option value="bimonthly">Bi-monthly (default -- most SST-02 registrants)</option>
                  <option value="monthly">Monthly (DG-approved variation)</option>
                  <option value="quarterly">Quarterly (Low-Value Goods registrants)</option>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="registeredOn" className={LABEL}>
                  SST registration date
                </label>
                <Input
                  id="registeredOn"
                  name="registeredOn"
                  type="date"
                  value={registeredOn}
                  disabled={!props.canEdit}
                  aria-describedby="registeredOn-message"
                  onChange={(e) => setRegisteredOn(e.target.value)}
                />
                <p id="registeredOn-message" className="text-[13px] text-muted">
                  Optional. Bounds your first taxable period so it is not fabricated before you registered.
                </p>
              </div>
            </div>
            <div className="rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2.5 text-[12.5px] text-ink-2" data-testid="sst-preview">
              {props.cadence ? "" : "Not configured yet: returns follow your bookkeeping periods. "}
              Based on your financial year end, your SST-02 periods are: {previewYear(props.fyeMonth, cadence, props.today)}.
            </div>
            <div className="flex items-center justify-end gap-3">
              <span role="status" className={filing ? (filing.ok ? "text-[12.5px] text-ink-2" : "text-[12.5px] text-negative") : "sr-only"}>
                {filing?.text}
              </span>
              {props.canEdit && (
                <Button type="submit" size="sm" disabled={saving}>
                  {saving ? "Saving..." : "Save SST filing settings"}
                </Button>
              )}
            </div>
          </form>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[13.5px] font-semibold text-ink">Deferred service tax account</h2>
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
          <p className="text-[13px] text-ink-2">
            Service tax on an invoice is due to Customs when the customer pays, or 12 months after the invoice date if unpaid. Kira books it to this account when you
            record the invoice and moves it to the SST output account on each payment, so the output balance matches the SST-02 return.
          </p>
          <p className="text-[13px] text-ink" data-testid="deferred-sst-account">
            <span className="font-mono">400-1700</span> · Deferred SST on unpaid invoices
          </p>
          <p className="text-[12px] text-muted">Only invoices and service tax releases post to this account; a manual journal is refused.</p>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[13.5px] font-semibold text-ink">Tax lock date</h2>
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex flex-col gap-3">
            <p className="max-w-prose text-[12.5px] text-muted">
              After you file an SST-02, lock SST to the last day of that period. Kira then refuses a change dated on or before the lock to what the return reads: invoices
              with SST, their voids, and payments received that pay service tax. Bills, manual journals (such as your payment to Customs) and other entries still post
              on any open date.
            </p>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="tax-lock-date" className={LABEL}>
                Tax lock date
              </label>
              <Input
                id="tax-lock-date"
                type="date"
                max={yesterday}
                value={lock}
                disabled={!props.canEdit}
                onChange={(e) => {
                  setLock(e.target.value);
                  setLockMsg(null);
                }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {props.canEdit && (
                <Button
                  type="button"
                  size="sm"
                  disabled={locking || lock === props.lockedUntil}
                  onClick={async () => {
                    setLocking(true);
                    const r = await saveSstLockAction(props.slug, lock);
                    setLocking(false);
                    setLockMsg(r.ok ? { ok: true, text: lock ? `SST locked to ${lock}.` : "Tax lock removed." } : { ok: false, text: r.error });
                    if (r.ok) start(() => router.refresh());
                  }}
                >
                  {locking ? "Saving..." : "Save lock date"}
                </Button>
              )}
              <span role="status" className={lockMsg ? (lockMsg.ok ? "text-[12.5px] text-ink-2" : "text-[12.5px] text-negative") : "sr-only"}>
                {lockMsg?.text}
              </span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
