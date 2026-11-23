"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { fromSen } from "@/features/books/money";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";
import { Input, Select } from "@/shared/ui/form-controls";
import {
  closePeriodAction,
  reopenPeriodAction,
  reverseEntryAction,
  voidEntryAction,
  type TieOut,
} from "./actions";

type P = { id: string; startsOn: string; endsOn: string; status: string };
const dmy = (iso: string) =>
  `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const rmMinor = (minor: string) => {
  const n = Number(minor);
  return `${n < 0 ? "-" : ""}RM${fromSen(Math.abs(n))}`;
};

/** lejar.ai's PeriodRangeSelect: two selects that push ?fromPeriodId= / ?toPeriodId=, with a loading / "Updated" note. */
export function PeriodRangeSelect({
  periods,
  fromId,
  toId,
  lang,
}: {
  periods: P[];
  fromId: string;
  toId: string;
  lang: "en" | "ms";
}) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending) {
      setDone(true);
      const t = setTimeout(() => setDone(false), 2500);
      wasPending.current = pending;
      return () => clearTimeout(t);
    }
    wasPending.current = pending;
  }, [pending]);
  const go = (key: string, value: string) => {
    const n = new URLSearchParams(sp.toString());
    n.set(key, value);
    const at = (id: string) => periods.find((p) => p.id === id)?.startsOn ?? "";
    if (key === "fromPeriodId")
      n.set("toPeriodId", at(value) > at(toId) ? value : toId);
    if (key === "toPeriodId")
      n.set("fromPeriodId", at(value) < at(fromId) ? value : fromId);
    setDone(false);
    start(() => router.push(`${path}?${n.toString()}`));
  };
  const label = (p: P, k: "startsOn" | "endsOn") =>
    `${dmy(p[k])}${p.status === "open" ? "" : ` (${p.status})`}`;
  const ms = lang === "ms";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="w-48">
        <Select
          value={fromId}
          onChange={(e) => go("fromPeriodId", e.target.value)}
          aria-label={ms ? "Tempoh pembukaan" : "Opening period"}
          disabled={pending}
        >
          {[...periods].reverse().map((p) => (
            <option key={p.id} value={p.id}>
              {label(p, "startsOn")}
            </option>
          ))}
        </Select>
      </div>
      <span className="text-[12px] text-muted">{ms ? "hingga" : "to"}</span>
      <div className="w-48">
        <Select
          value={toId}
          onChange={(e) => go("toPeriodId", e.target.value)}
          aria-label={ms ? "Tempoh penutupan" : "Closing period"}
          disabled={pending}
        >
          {[...periods].reverse().map((p) => (
            <option key={p.id} value={p.id}>
              {label(p, "endsOn")}
            </option>
          ))}
        </Select>
      </div>
      {pending ? (
        <span
          role="status"
          className="flex items-center gap-1.5 text-[12px] text-muted"
        >
          <span
            aria-hidden="true"
            className="h-3 w-3 animate-spin rounded-full border-2 border-border border-t-ink"
          />
          {ms ? "Memuatkan…" : "Loading…"}
        </span>
      ) : done ? (
        <span role="status" className="text-[12px] text-positive">
          {ms ? "Dikemas kini" : "Updated"}
        </span>
      ) : null}
    </div>
  );
}

const KIND: Record<string, string> = { ar: "Receivables", ap: "Payables" };

/** lejar.ai's sub-ledger check panel shown when closing finds differences. */
function TieOutPanel({
  orgSlug,
  tieOut,
  canOverride,
  pending,
  onOverride,
}: {
  orgSlug: string;
  tieOut: TieOut;
  canOverride: boolean;
  pending: boolean;
  onOverride: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const diffs = tieOut.lines.filter((l) => l.difference_minor !== "0");
  return (
    <div
      className="flex max-w-xl flex-col gap-2 rounded-[var(--radius)] border border-warning/40 bg-warning-soft px-3 py-2.5 text-left"
      data-testid="tie-out"
    >
      <p className="m-0 text-[13px] font-medium text-ink">
        Sub-ledger check at {dmy(tieOut.as_of)}
      </p>
      <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[13px] text-ink-2">
        {diffs.length === 0 && (
          <li>Receivables and payables agree with the ledger.</li>
        )}
        {diffs.map((l) => (
          <li key={`${l.kind}:${l.account_code}`}>
            {KIND[l.kind] ?? l.kind} {l.account_code} {l.account_name}: ledger{" "}
            {rmMinor(l.ledger_minor)}, sub-ledger {rmMinor(l.sub_ledger_minor)},
            difference {rmMinor(l.difference_minor)}
            <Link
              href={`/${orgSlug}/${l.kind === "ar" ? "invoices" : "bills"}`}
              className="ml-2 text-[12.5px] font-medium text-brand hover:underline"
            >
              Fix {KIND[l.kind]?.toLowerCase() ?? l.kind}
            </Link>
          </li>
        ))}
      </ul>
      {canOverride && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason to close anyway (required)"
            aria-label="Reason to close anyway"
            className="w-72"
            maxLength={500}
          />
          <Button
            size="sm"
            variant="danger"
            disabled={pending || reason.trim() === ""}
            onClick={() => onOverride(reason)}
          >
            {pending ? "Closing..." : "Close anyway"}
          </Button>
        </div>
      )}
    </div>
  );
}

/** lejar.ai's CloseOrReopen for the closing period of the range. */
export function CloseOrReopen({
  orgSlug,
  period,
  canManage,
}: {
  orgSlug: string;
  period: P;
  canManage: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [tie, setTie] = useState<{
    tieOut: TieOut;
    canOverride: boolean;
  } | null>(null);
  const [pending, start] = useTransition();
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState("");
  const tone =
    period.status === "open"
      ? "chip brand"
      : period.status === "closing"
        ? "chip warn"
        : "chip";

  const close = (override?: string) =>
    start(async () => {
      setError(null);
      setNote(null);
      setTie(null);
      const r = await closePeriodAction(orgSlug, period.id, override);
      if (r.ok) {
        if (r.tieOut) setTie({ tieOut: r.tieOut, canOverride: false });
        setNote(
          [
            "Period closed.",
            r.tieOut ? "Closed with warnings, shown below." : "",
          ]
            .filter(Boolean)
            .join(" "),
        );
        router.refresh();
      } else if (r.tieOut)
        setTie({ tieOut: r.tieOut, canOverride: r.canOverride ?? false });
      else setError(r.error ?? "Could not close the period.");
    });

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <span className="flex items-center gap-1.5 text-[13px] text-muted">
        Period {dmy(period.startsOn)} to {dmy(period.endsOn)}
        <span className={tone}>{period.status}</span>
      </span>
      {canManage &&
        (period.status === "open" ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => close()}
            disabled={pending}
          >
            {pending ? "Closing..." : "Close period"}
          </Button>
        ) : reopening ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (required)"
              aria-label="Reopen reason"
              className="w-56"
              autoFocus
            />
            <Button
              size="sm"
              onClick={() => {
                if (!reason.trim())
                  return setError("Reopen requires a reason.");
                start(async () => {
                  setError(null);
                  const r = await reopenPeriodAction(
                    orgSlug,
                    period.id,
                    reason,
                  );
                  if (r.ok) {
                    setReopening(false);
                    setReason("");
                    setNote(null);
                    setTie(null);
                    router.refresh();
                  } else setError(r.error);
                });
              }}
              disabled={pending}
            >
              {pending ? "Reopening..." : "Confirm reopen"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setReopening(false);
                setReason("");
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setReopening(true)}
          >
            Reopen period
          </Button>
        ))}
      {tie && (
        <TieOutPanel
          orgSlug={orgSlug}
          tieOut={tie.tieOut}
          canOverride={tie.canOverride}
          pending={pending}
          onOverride={(r) => close(r)}
        />
      )}
      {error && (
        <p
          role="alert"
          className="m-0 max-w-xl text-right text-[13px] text-negative"
        >
          {error}
        </p>
      )}
      {note && (
        <p role="status" className="m-0 text-[13px] text-muted">
          {note}
        </p>
      )}
    </div>
  );
}

/** lejar.ai's LedgerSectionTabs (roving tab index, arrow keys). */
export function LedgerTabs({
  tabs,
  label,
}: {
  tabs: { key: string; label: string; count?: number; panel: ReactNode }[];
  label: string;
}) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");
  const id = useId();
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const idx = Math.max(
    0,
    tabs.findIndex((t) => t.key === active),
  );
  const focus = (i: number) => {
    const t = tabs[i];
    if (!t) return;
    setActive(t.key);
    refs.current.get(t.key)?.focus();
  };
  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label={label}
        className="flex gap-1 border-b border-border"
      >
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <button
              key={t.key}
              ref={(el) => {
                if (el) refs.current.set(t.key, el);
                else refs.current.delete(t.key);
              }}
              type="button"
              role="tab"
              id={`${id}-tab-${t.key}`}
              aria-selected={on}
              aria-controls={`${id}-panel-${t.key}`}
              tabIndex={on ? 0 : -1}
              onClick={() => setActive(t.key)}
              onKeyDown={(e) => {
                const last = tabs.length - 1;
                if (e.key === "ArrowRight") focus(idx === last ? 0 : idx + 1);
                else if (e.key === "ArrowLeft")
                  focus(idx === 0 ? last : idx - 1);
                else if (e.key === "Home") focus(0);
                else if (e.key === "End") focus(last);
                else return;
                e.preventDefault();
              }}
              className={cn(
                "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[12.5px] font-medium transition-colors",
                on
                  ? "border-ink text-ink"
                  : "border-transparent text-muted hover:text-ink-2",
              )}
            >
              {t.label}
              {t.count != null && (
                <span className="num rounded-full bg-surface-2 px-1.5 py-px text-[11.5px] font-semibold text-muted">
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div
          key={t.key}
          role="tabpanel"
          id={`${id}-panel-${t.key}`}
          aria-labelledby={`${id}-tab-${t.key}`}
          hidden={t.key !== active}
          tabIndex={0}
        >
          {t.panel}
        </div>
      ))}
    </div>
  );
}

/** lejar.ai's HideVoidedToggle: a cookie (here kira_hide_voided), then refresh. */
export function HideVoidedToggle({
  hideVoided,
  label,
}: {
  hideVoided: boolean;
  label: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // Shows the new state at once; the list follows when the refresh lands.
  const [checked, setChecked] = useState(hideVoided);
  return (
    <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
      <input
        type="checkbox"
        className="accent-brand"
        checked={checked}
        disabled={pending}
        onChange={(e) => {
          setChecked(e.target.checked);
          document.cookie = `kira_hide_voided=${e.target.checked ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
          start(() => router.refresh());
        }}
      />
      {label}
    </label>
  );
}

/** lejar.ai's ReverseEntryButton: date + reason, then "Reversal posted on … · View the reversal". */
export function ReverseEntryButton({
  orgSlug,
  entryId,
  defaultOn,
  minOn,
}: {
  orgSlug: string;
  entryId: string;
  defaultOn: string;
  minOn: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [on, setOn] = useState(defaultOn);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{
    entryId: string;
    occurredOn: string;
  } | null>(null);
  const [pending, start] = useTransition();
  if (done) {
    return (
      <div className="flex w-64 flex-col items-end gap-1">
        <span role="status" className="text-right text-[12px] text-positive">
          Reversal posted on <span className="num">{done.occurredOn}</span>.
        </span>
        <div className="flex items-center gap-2 text-[12px]">
          <Link
            href={`/${orgSlug}/ledger/entries/${done.entryId}`}
            className="text-brand hover:underline"
          >
            View the reversal
          </Link>
          <button
            type="button"
            onClick={() => setDone(null)}
            className="text-muted hover:text-ink-2"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }
  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Reverse
      </Button>
    );
  }
  return (
    <div className="flex w-64 flex-col gap-1.5">
      <Input
        type="date"
        value={on}
        min={minOn}
        onChange={(e) => setOn(e.target.value)}
        aria-label="Reversal date"
      />
      <Input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (required)"
        aria-label="Reversal reason"
        autoFocus
      />
      <div className="flex gap-1.5">
        <Button
          size="sm"
          disabled={pending}
          onClick={() => {
            if (!reason.trim()) return setError("Reason is required.");
            start(async () => {
              setError(null);
              const r = await reverseEntryAction(orgSlug, entryId, on, reason);
              if (r.ok) {
                setOpen(false);
                setReason("");
                setDone({ entryId: r.entryId, occurredOn: r.occurredOn });
                router.refresh();
              } else setError(r.error);
            });
          }}
        >
          {pending ? "Reversing..." : "Confirm reverse"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setReason("");
            setError(null);
          }}
        >
          Cancel
        </Button>
      </div>
      {error && (
        <span role="alert" className="text-[12px] text-negative">
          {error}
        </span>
      )}
    </div>
  );
}

/** lejar.ai's VoidEntryButton: "Voiding removes this entry from all books and reports. It cannot be undone." */
export function VoidEntryButton({
  orgSlug,
  entryId,
}: {
  orgSlug: string;
  entryId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Void
      </Button>
    );
  }
  return (
    <div className="flex w-64 flex-col gap-1.5">
      <p className="m-0 text-[11.5px] text-muted">
        Voiding removes this entry from all books and reports. It cannot be
        undone.
      </p>
      <Input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (required)"
        autoFocus
        aria-label="Void reason"
      />
      <div className="flex gap-1.5">
        <Button
          size="sm"
          disabled={pending}
          onClick={() => {
            if (!reason.trim()) return setError("Reason is required.");
            start(async () => {
              setError(null);
              const r = await voidEntryAction(orgSlug, entryId, reason);
              if (r.ok) {
                setOpen(false);
                setReason("");
                router.refresh();
              } else setError(r.error);
            });
          }}
        >
          {pending ? "Voiding..." : "Confirm void"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setOpen(false);
            setReason("");
            setError(null);
          }}
        >
          Cancel
        </Button>
      </div>
      {error && <span className="text-[12px] text-negative">{error}</span>}
    </div>
  );
}
