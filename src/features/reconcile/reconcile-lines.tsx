"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fromSen } from "@/features/books/money";
import type { Lang } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";
import { markLineReconciledAction, saveReconciliationAction, unmarkLineReconciledAction } from "./actions";
import { rt } from "./copy";

export type BankLine = { id: string; date: string; memo: string | null; debit: number; credit: number; reconciledOn: string | null; source: "manual" | "import" | null };

const TH = "border-b border-border px-[var(--pad-x)] py-2 text-left text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted";
const TD = "h-[var(--row-h)] border-b border-border px-[var(--pad-x)] align-middle";
const money = (sen: number) => (sen === 0 ? "—" : fromSen(sen));

/** lejar.ai's ReconcileLines: outstanding lines to tick, and reconciled lines with their source and Undo. */
export function ReconcileLines({ orgSlug, lang, statementDate, outstanding, reconciled, canEdit }: { orgSlug: string; lang: Lang; statementDate: string; outstanding: BankLine[]; reconciled: BankLine[]; canEdit: boolean }) {
  const t = (k: Parameters<typeof rt>[1], v?: Record<string, string | number>) => rt(lang, k, v);
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const run = (id: string, fn: () => ReturnType<typeof markLineReconciledAction>) => {
    setBusy(id);
    start(async () => {
      setError(null);
      const r = await fn();
      setBusy(null);
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="text-[12.5px] text-negative">{error}</p>}
      <section data-flow="reconcile-lines" className="flex flex-col gap-2">
        <h2 className="text-[13.5px] font-semibold text-ink">
          {t("reconcile.lines.outstandingTitle")} <span className="font-normal text-muted">· {t("reconcile.lines.outstandingSub")}</span>{" "}
          <span className="num font-normal text-muted">({outstanding.length})</span>
        </h2>
        {outstanding.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-6 text-center text-[13px] text-muted">{t("reconcile.lines.outstandingEmpty")}</p>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
            <table className="w-full border-collapse text-[13px]">
              <thead className="bg-surface">
                <tr>
                  <th className={cn(TH, "w-10")}>
                    <span className="sr-only">{t("reconcile.lines.reconcile")}</span>
                  </th>
                  <th className={TH}>{t("reconcile.lines.date")}</th>
                  <th className={TH}>{t("reconcile.lines.memo")}</th>
                  <th className={cn(TH, "text-right")}>{t("reconcile.lines.debit")}</th>
                  <th className={cn(TH, "text-right")}>{t("reconcile.lines.credit")}</th>
                </tr>
              </thead>
              <tbody>
                {outstanding.map((l) => (
                  <tr key={l.id} className="transition-colors hover:bg-surface-2">
                    <td className={TD}>
                      <input
                        type="checkbox"
                        aria-label={t("reconcile.lines.tick", { date: l.date })}
                        disabled={!canEdit || busy === l.id}
                        checked={false}
                        onChange={() => run(l.id, () => markLineReconciledAction(orgSlug, l.id, statementDate))}
                      />
                    </td>
                    <td className={cn(TD, "num-sans text-ink-2")}>{l.date}</td>
                    <td className={cn(TD, "text-ink")}>{l.memo ?? t("reconcile.lines.noMemo")}</td>
                    <td className={cn(TD, "num text-right text-ink")}>{money(l.debit)}</td>
                    <td className={cn(TD, "num text-right text-ink")}>{money(l.credit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-[13.5px] font-semibold text-ink">
          {t("reconcile.lines.reconciledTitle")} <span className="font-normal text-muted">· {t("reconcile.lines.reconciledSub")}</span>{" "}
          <span className="num font-normal text-muted">({reconciled.length})</span>
        </h2>
        {reconciled.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-6 text-center text-[13px] text-muted">{t("reconcile.lines.reconciledEmpty")}</p>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
            <table className="w-full border-collapse text-[13px]">
              <thead className="bg-surface">
                <tr>
                  <th className={TH}>{t("reconcile.lines.date")}</th>
                  <th className={TH}>{t("reconcile.lines.memo")}</th>
                  <th className={cn(TH, "text-right")}>{t("reconcile.lines.debit")}</th>
                  <th className={cn(TH, "text-right")}>{t("reconcile.lines.credit")}</th>
                  <th className={TH}>{t("reconcile.lines.source")}</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody>
                {reconciled.map((l) => (
                  <tr key={l.id}>
                    <td className={cn(TD, "num-sans text-ink-2")}>{l.date}</td>
                    <td className={cn(TD, "text-ink")}>{l.memo ?? t("reconcile.lines.noMemo")}</td>
                    <td className={cn(TD, "num text-right text-ink")}>{money(l.debit)}</td>
                    <td className={cn(TD, "num text-right text-ink")}>{money(l.credit)}</td>
                    <td className={TD}>
                      <span className="chip">{l.source === "import" ? t("reconcile.lines.import") : t("reconcile.lines.manual")}</span>
                    </td>
                    <td className={TD}>
                      {canEdit && (
                        <Button variant="ghost" size="sm" disabled={busy === l.id} onClick={() => run(l.id, () => unmarkLineReconciledAction(orgSlug, l.id))}>
                          {t("reconcile.lines.undo")}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/** lejar.ai's SaveReconciliationButton. */
export function SaveReconciliationButton({ orgSlug, lang, account, date, balance }: { orgSlug: string; lang: Lang; account: string; date: string; balance: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await saveReconciliationAction(orgSlug, account, date, balance);
            if (r.ok) {
              setSaved(true);
              router.refresh();
            } else setError(r.error);
          })
        }
      >
        {rt(lang, pending ? "reconcile.save.saving" : saved ? "reconcile.save.saved" : "reconcile.save.button")}
      </Button>
      {error && <span className="text-[12px] text-negative">{error}</span>}
    </div>
  );
}
