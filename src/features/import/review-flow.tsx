"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AccountCombobox } from "@/features/books/account-combobox";
import type { AccountOption } from "@/features/books/load";
import { fromSen, toSen } from "@/features/books/money";
import type { Lang } from "@/shared/i18n";
import { Button, buttonClass } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";
import { Input, Select } from "@/shared/ui/form-controls";
import { categoriseChunkAction, confirmMatchesAction, recordLinesAction, updateLineAction } from "./actions";
import { bt } from "./banks";
import { settleStatementLineAction } from "@/features/payments/actions";
import type { Match, ReviewLine, Settle, StatementInfo } from "./load";

const CHUNK = 40;
/** Below this, a suggestion is flagged "Low confidence. Check the category." (Kira's threshold). */
const LOW = 0.6;
const TH = "border-b border-border px-2.5 py-2 text-left text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted";
const TD = "border-b border-border px-2.5 py-2 align-top";

/**
 * Step 2 of lejar.ai's ImportFlow for one statement: AI categorises the drafts in batches of 40
 * ("Categorising batch n of total"), lines that match an existing entry can be confirmed instead of
 * recorded, the rest are reviewed (category, edit, skip) and recorded in one batch.
 */
export function ReviewFlow({
  orgSlug,
  lang,
  info,
  lines,
  matches,
  settles = [],
  accounts,
  queue,
  position,
  total,
  canEdit,
}: {
  orgSlug: string;
  lang: Lang;
  info: StatementInfo;
  lines: ReviewLine[];
  matches: Match[];
  settles?: Settle[];
  accounts: AccountOption[];
  queue: string[];
  position: number;
  total: number;
  canEdit: boolean;
}) {
  const t = (k: Parameters<typeof bt>[1], v?: Record<string, string | number>) => bt(lang, k, v);
  const router = useRouter();
  const contra = useMemo(() => accounts.filter((a) => !a.isCash), [accounts]);
  const matchFor = useMemo(() => new Map(matches.map((m) => [m.lineId, m])), [matches]);
  const settleFor = useMemo(() => new Map(settles.map((x) => [x.lineId, x])), [settles]);
  const drafts = lines.filter((l) => l.status === "draft" && !matchFor.has(l.id));
  const matched = lines.filter((l) => l.status === "draft" && matchFor.has(l.id));
  const skipped = lines.filter((l) => l.status === "skipped");
  const duplicates = lines.filter((l) => l.status === "duplicate");
  const done = lines.filter((l) => l.status === "recorded" || l.status === "matched");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pickedMatches, setPickedMatches] = useState<Set<string>>(new Set(matched.map((l) => l.id)));
  const [progress, setProgress] = useState<{ n: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ date: "", description: "", amount: "", direction: "out" as "in" | "out" });
  const [pending, start] = useTransition();
  const started = useRef(false);

  // Categorise the drafts that have no suggestion yet, 40 at a time.
  useEffect(() => {
    if (!canEdit || started.current) return;
    const todo = lines.filter((l) => l.status === "draft" && !l.categorised).map((l) => l.position);
    if (todo.length === 0) return;
    started.current = true;
    (async () => {
      const batches = Math.ceil(todo.length / CHUNK);
      for (let i = 0; i < batches; i++) {
        setProgress({ n: i + 1, total: batches });
        const r = await categoriseChunkAction(orgSlug, info.id, todo.slice(i * CHUNK, (i + 1) * CHUNK));
        if (!r.ok) {
          setError(r.notConfigured ? r.error : t("bankImport.flow.batchError", { n: i + 1, error: r.error }));
          break;
        }
      }
      setProgress(null);
      router.refresh();
    })();
  }, [canEdit, lines, orgSlug, info.id, router]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (id: string, p: Parameters<typeof updateLineAction>[2]) =>
    start(async () => {
      const r = await updateLineAction(orgSlug, id, p);
      if (!r.ok) setError(r.error);
      else {
        setError(null);
        router.refresh();
      }
    });

  const record = (ids: string[]) =>
    start(async () => {
      setError(null);
      const r = await recordLinesAction(orgSlug, ids);
      if (!r.ok) return setError(r.error);
      setSelected(new Set());
      const parts = [r.recorded === 1 ? t("bankImport.result.recordedOne") : t("bankImport.result.recordedMany", { count: r.recorded })];
      if (r.failed.length > 0) parts.push(t("bankImport.result.failed", { count: r.failed.length }) + ` (${r.failed.map((f) => `#${f.position}: ${f.error}`).join("; ")})`);
      setResult(parts.join(" "));
      router.refresh();
    });

  const confirm = () =>
    start(async () => {
      setError(null);
      const pairs = matched.filter((l) => pickedMatches.has(l.id)).map((l) => ({ lineId: l.id, entryId: matchFor.get(l.id)!.entryId }));
      const r = await confirmMatchesAction(orgSlug, pairs);
      if (!r.ok) return setError(r.error);
      setResult(r.confirmed === 1 ? t("bankImport.flow.confirm.one") : t("bankImport.flow.confirm.many", { count: r.confirmed }));
      router.refresh();
    });

  const withCategory = drafts.filter((l) => l.accountCode);
  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const money = (l: ReviewLine) => fromSen(toSen(l.amount) ?? 0);
  const nextHref = queue.length > 0 ? `/${orgSlug}/import?statement=${queue[0]}${queue.length > 1 ? `&queue=${queue.slice(1).join(",")}` : ""}&pos=${position + 1}&total=${total}` : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[13px] text-ink-2">
          {total > 1 && <span className="chip mr-2">{lang === "ms" ? `Penyata ${position} daripada ${total}` : `Statement ${position} of ${total}`}</span>}
          <span className="font-medium text-ink">{info.fileName}</span> · {info.account.code} {info.account.name}
          {info.periodStart && ` · ${info.periodStart} – ${info.periodEnd}`}
        </div>
        <div className="flex gap-2">
          {nextHref ? (
            <Link href={nextHref} className={buttonClass("secondary", "sm")}>
              {drafts.length > 0 ? t("bankImport.flow.queue.skipNext") : t("bankImport.flow.queue.next")}
            </Link>
          ) : (
            <Link href={`/${orgSlug}/import`} className={buttonClass("secondary", "sm")}>
              {t("bankImport.flow.queue.finish")}
            </Link>
          )}
        </div>
      </div>

      {progress && (
        <div className="flex flex-col gap-1.5" role="status">
          <span className="text-[12.5px] text-muted">{t("bankImport.flow.progress.batch", { n: progress.n, total: progress.total })}</span>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" aria-label={t("bankImport.flow.progress.aria")}>
            <div className="h-full bg-ai transition-all" style={{ width: `${(progress.n / progress.total) * 100}%` }} />
          </div>
        </div>
      )}
      {info.warnings.length > 0 && (
        <details className="rounded border border-warning/40 bg-warning-soft px-3 py-2 text-[12.5px] text-ink-2">
          <summary className="cursor-pointer">{info.warnings.length === 1 ? t("bankImport.flow.review.warningsOne") : t("bankImport.flow.review.warningsMany", { count: info.warnings.length })}</summary>
          <ul className="m-0 mt-1 list-disc pl-5">
            {info.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </details>
      )}
      {duplicates.length > 0 && (
        <p className="rounded border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2">
          {duplicates.length === 1 ? t("bankImport.flow.alreadyReconciled.countOne") : t("bankImport.flow.alreadyReconciled.countMany", { count: duplicates.length })}
        </p>
      )}
      {result && (
        <p role="status" className="rounded border border-positive/30 bg-positive-soft px-3 py-2 text-[13px] text-positive">
          {result}
        </p>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-negative">
          {error}
        </p>
      )}

      {matched.length > 0 && (
        <section className="card flex flex-col gap-3 p-4">
          <h2 className="m-0 text-[13.5px] font-semibold text-ink">{matched.length === 1 ? t("bankImport.flow.matches.headOne") : t("bankImport.flow.matches.headMany", { count: matched.length })}</h2>
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
            <table className="w-full border-collapse text-[13px]">
              <thead className="bg-surface">
                <tr>
                  <th className={TH}>
                    <input type="checkbox" aria-label={t("bankImport.flow.matches.selectAll")} checked={pickedMatches.size === matched.length} onChange={(e) => setPickedMatches(new Set(e.target.checked ? matched.map((l) => l.id) : []))} />
                  </th>
                  <th className={TH}>{t("bankImport.flow.th.statementDate")}</th>
                  <th className={TH}>{t("bankImport.flow.th.description")}</th>
                  <th className={cn(TH, "text-right")}>{t("bankImport.flow.th.amount")}</th>
                  <th className={TH}>{t("bankImport.flow.th.matched")}</th>
                </tr>
              </thead>
              <tbody>
                {matched.map((l) => {
                  const m = matchFor.get(l.id)!;
                  return (
                    <tr key={l.id}>
                      <td className={TD}>
                        <input type="checkbox" aria-label={t("bankImport.flow.match.confirmAria", { description: l.description })} checked={pickedMatches.has(l.id)} onChange={() => setPickedMatches((s) => { const n = new Set(s); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); return n; })} />
                      </td>
                      <td className={cn(TD, "num-sans text-ink-2")}>{l.date}</td>
                      <td className={cn(TD, "text-ink")}>{l.description}</td>
                      <td className={cn(TD, "num text-right", l.direction === "in" ? "text-positive" : "text-ink")}>{l.direction === "in" ? "+" : "−"}{money(l)}</td>
                      <td className={cn(TD, "text-ink-2")}>
                        {m.memo ?? t("bankImport.flow.match.noMemo")} · {m.date} · {m.daysApart === 0 ? t("bankImport.flow.match.sameDay") : m.daysApart === 1 ? t("bankImport.flow.match.daysApartOne") : t("bankImport.flow.match.daysApartMany", { count: m.daysApart })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {canEdit && (
            <div>
              <Button variant="primary" size="sm" disabled={pending || pickedMatches.size === 0} onClick={confirm}>
                {pending ? t("bankImport.flow.matches.confirming") : pickedMatches.size === 1 ? t("bankImport.flow.matches.confirmOne") : t("bankImport.flow.matches.confirmMany", { count: pickedMatches.size })}
              </Button>
            </div>
          )}
        </section>
      )}

      <section data-flow="import-review" className="flex flex-col gap-3">
        <h2 className="m-0 text-[13.5px] font-semibold text-ink">
          {drafts.length === 1 ? t("bankImport.flow.review.headOne") : t("bankImport.flow.review.headMany", { count: drafts.length })}
          {skipped.length > 0 && <span className="font-normal text-muted"> {t("bankImport.flow.review.skipped", { count: skipped.length })}</span>}
        </h2>
        {drafts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-8 text-center text-[13px] text-muted">{t("bankImport.flow.review.empty")}</p>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
            <table className="w-full border-collapse text-[13px]">
              <thead className="bg-surface">
                <tr>
                  <th className={TH}>
                    <input type="checkbox" aria-label={t("bankImport.flow.review.selectAll")} checked={selected.size > 0 && selected.size === drafts.length} onChange={(e) => setSelected(new Set(e.target.checked ? drafts.map((l) => l.id) : []))} />
                  </th>
                  <th className={TH}>{t("bankImport.flow.th.date")}</th>
                  <th className={TH}>{t("bankImport.flow.th.description")}</th>
                  <th className={cn(TH, "text-right")}>{t("bankImport.flow.th.amount")}</th>
                  <th className={cn(TH, "min-w-[260px]")}>{t("bankImport.flow.th.contra")}</th>
                  <th className={cn(TH, "text-right")}>{t("bankImport.flow.th.confidence")}</th>
                  <th className={TH}>{t("bankImport.flow.th.reasoning")}</th>
                  <th className={TH}>{t("bankImport.flow.th.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((l) =>
                  editing === l.id ? (
                    <tr key={l.id} className="bg-surface-2">
                      <td className={TD} />
                      <td className={TD}>
                        <Input type="date" aria-label={t("bankImport.flow.row.editDateAria", { description: l.description })} value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
                      </td>
                      <td className={TD}>
                        <Input aria-label={t("bankImport.flow.row.editDescriptionAria", { description: l.description })} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
                      </td>
                      <td className={TD}>
                        <div className="flex gap-1.5">
                          <Select className="w-[92px]" aria-label={t("bankImport.flow.row.editDirectionAria", { description: l.description })} value={draft.direction} onChange={(e) => setDraft({ ...draft, direction: e.target.value as "in" | "out" })}>
                            <option value="in">{t("bankImport.flow.row.inSign")}</option>
                            <option value="out">{t("bankImport.flow.row.outSign")}</option>
                          </Select>
                          <Input className="w-[110px] text-right" inputMode="decimal" aria-label={t("bankImport.flow.row.editAmountAria", { description: l.description })} value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
                        </div>
                      </td>
                      <td className={TD} colSpan={3} />
                      <td className={TD}>
                        <div className="flex gap-1.5">
                          <Button size="sm" variant="primary" disabled={pending} onClick={() => { setEditing(null); patch(l.id, draft); }}>
                            {t("bankImport.flow.row.save")}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                            {t("bankImport.flow.row.cancel")}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={l.id} className="transition-colors hover:bg-surface-2">
                      <td className={TD}>
                        <input type="checkbox" aria-label={t("bankImport.flow.row.selectAria", { description: l.description })} checked={selected.has(l.id)} onChange={() => toggle(l.id)} disabled={!canEdit} />
                      </td>
                      <td className={cn(TD, "num-sans whitespace-nowrap text-ink-2")}>{l.date}</td>
                      <td className={cn(TD, "text-ink")}>
                        {l.description}
                        <div className="text-[11.5px] text-muted">
                          {[l.reference && t("bankImport.flow.row.reference", { reference: l.reference }), l.balance && t("bankImport.flow.row.balance", { amount: l.balance }), l.edited && t("bankImport.flow.row.edited")].filter(Boolean).join(" · ")}
                        </div>
                      </td>
                      <td className={cn(TD, "num whitespace-nowrap text-right", l.direction === "in" ? "text-positive" : "text-ink")}>
                        <span className="mr-1 text-[10.5px] text-muted">{l.direction === "in" ? t("bankImport.flow.row.in") : t("bankImport.flow.row.out")}</span>
                        {money(l)}
                      </td>
                      <td className={TD}>
                        <AccountCombobox
                          accounts={contra}
                          value={l.accountCode ?? ""}
                          onChange={(code) => code && code !== l.accountCode && patch(l.id, { accountCode: code })}
                          placeholder={t("bankImport.flow.emptyDraftReason")}
                          ariaLabel={t("bankImport.flow.row.contraAria", { description: l.description })}
                        />
                        {settleFor.has(l.id) && canEdit && (
                          <button
                            type="button"
                            disabled={pending}
                            className="mt-1.5 block text-left text-[12px] font-medium text-brand underline underline-offset-2"
                            onClick={() =>
                              start(async () => {
                                const x = settleFor.get(l.id)!;
                                const r = await settleStatementLineAction(orgSlug, l.id, x.docId, x.kind === "invoice" ? "receipts" : "payments");
                                if (!r.ok) setError(r.error);
                                else {
                                  setError(null);
                                  setResult(x.kind === "invoice" ? `Recorded a receipt against ${x.number} (${x.party}). The statement line is reconciled.` : `Recorded a payment against ${x.number} (${x.party}). The statement line is reconciled.`);
                                  router.refresh();
                                }
                              })
                            }
                          >
                            {settleFor.get(l.id)!.kind === "invoice" ? `Record as receipt against ${settleFor.get(l.id)!.number}` : `Record as payment against ${settleFor.get(l.id)!.number}`}
                          </button>
                        )}
                        {l.suggestedCode && l.suggestedCode !== l.accountCode && <div className="mt-1 text-[11.5px] text-muted">{t("bankImport.flow.row.aiSuggested", { code: l.suggestedCode })}</div>}
                        {l.accountCode && l.confidence !== null && l.confidence < LOW && l.accountCode === l.suggestedCode && <div className="mt-1 text-[11.5px] text-warning">{t("bankImport.flow.row.lowConfidence")}</div>}
                      </td>
                      <td className={cn(TD, "num text-right text-ink-2")}>{l.confidence === null ? "" : `${Math.round(l.confidence * 100)}%`}</td>
                      <td className={cn(TD, "max-w-[260px] text-[12px] text-muted")}>{l.reasoning ?? (l.categorised ? "" : t("bankImport.flow.skipped.itemNoSuggestion"))}</td>
                      <td className={TD}>
                        {canEdit && (
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" disabled={pending || !l.accountCode} title={l.accountCode ? undefined : t("bankImport.flow.row.pickFirst")} onClick={() => record([l.id])}>
                              {t("bankImport.flow.row.record")}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => { setEditing(l.id); setDraft({ date: l.date, description: l.description, amount: l.amount, direction: l.direction }); }}>
                              {t("bankImport.flow.row.edit")}
                            </Button>
                            <Button size="sm" variant="ghost" disabled={pending} onClick={() => patch(l.id, { status: "skipped" })}>
                              {t("bankImport.flow.row.delete")}
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
        {canEdit && drafts.length > 0 && (
          <div data-flow="import-approve" className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setSelected(new Set(withCategory.map((l) => l.id)))}>
              {t("bankImport.flow.approve.all")}
            </Button>
            <Button variant="primary" disabled={pending || selected.size === 0} onClick={() => record([...selected])}>
              {pending ? t("bankImport.flow.approve.recording") : selected.size === 1 ? t("bankImport.flow.approve.recordOne") : t("bankImport.flow.approve.recordMany", { count: selected.size })}
            </Button>
          </div>
        )}
      </section>

      {skipped.length > 0 && (
        <details className="card px-4 py-3">
          <summary className="cursor-pointer text-[13px] font-medium text-ink-2">{skipped.length === 1 ? t("bankImport.flow.skipped.one") : t("bankImport.flow.skipped.many", { count: skipped.length })}</summary>
          <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0 text-[12.5px]">
            {skipped.map((l) => (
              <li key={l.id} className="flex items-center gap-3">
                <span className="num-sans text-muted">{l.date}</span>
                <span className="flex-1 text-ink-2">{l.description}</span>
                <span className="num text-ink-2">{l.direction === "in" ? "+" : "−"}{money(l)}</span>
                {canEdit && (
                  <Button size="sm" variant="ghost" onClick={() => patch(l.id, { status: "draft" })}>
                    Restore
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      {done.length > 0 && (
        <p className="text-[12.5px] text-muted">
          {done.length === 1 ? t("bankImport.flow.alreadyImported.linesOne") : t("bankImport.flow.alreadyImported.linesMany", { count: done.length })}
        </p>
      )}
    </div>
  );
}
