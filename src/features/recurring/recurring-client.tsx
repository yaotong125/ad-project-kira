"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";
import { rm } from "@/features/books/money";
import type { Lang } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";
import { Input, Select } from "@/shared/ui/form-controls";
import { createRecurringAction, generateDueRecurringAction, setRecurringStatusAction } from "./actions";
import { recurringCopy } from "./copy";
import {
  TAX_RATES,
  type AccountOpt,
  type ContactOpt,
  type Frequency,
  type RecurringKind,
  type RecurringLineInput,
  type RecurringRunRow,
  type RecurringStatus,
  type RecurringTemplateRow,
} from "./types";

const TH = "border-b border-border px-[var(--pad-x)] py-2 text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted";
const TD = "h-[var(--row-h)] border-b border-border px-[var(--pad-x)] align-middle";

const STATUS_CHIP: Record<RecurringStatus, [string, string, string]> = {
  active: ["chip pos", "Active", "Aktif"],
  paused: ["chip warn", "Paused", "Dijeda"],
  completed: ["chip", "Completed", "Selesai"],
  cancelled: ["chip", "Cancelled", "Dibatalkan"],
};

function parseAccountCode(raw: string, accounts: AccountOpt[]): string {
  const trimmed = raw.trim();
  const direct = accounts.find((a) => a.code === trimmed || `${a.code} · ${a.name}` === trimmed);
  if (direct) return direct.code;
  const codePart = trimmed.split("·")[0]?.trim() ?? trimmed;
  return codePart;
}

export function RecurringClient({
  orgSlug,
  kind,
  lang,
  today,
  canEdit,
  contacts,
  accounts,
  templates,
  runs,
}: {
  orgSlug: string;
  kind: RecurringKind;
  lang: Lang;
  today: string;
  canEdit: boolean;
  contacts: ContactOpt[];
  accounts: AccountOpt[];
  templates: RecurringTemplateRow[];
  runs: RecurringRunRow[];
}) {
  const router = useRouter();
  const base = `/${orgSlug}`;
  const ms = lang === "ms";
  const c = recurringCopy(kind, lang);
  const contactListId = useId();
  const accountListId = useId();

  const defaultAccount = accounts[0] ? `${accounts[0].code} · ${accounts[0].name}` : "";
  const [name, setName] = useState("");
  const [partyInput, setPartyInput] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [intervalCount, setIntervalCount] = useState("1");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState("");
  const [occurrencesLimit, setOccurrencesLimit] = useState("");
  const [dueOffsetDays, setDueOffsetDays] = useState("30");
  const [numberPrefix, setNumberPrefix] = useState(kind === "invoice" ? "REC-INV-" : "REC-BILL-");
  const [autoRecord, setAutoRecord] = useState(false);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<RecurringLineInput[]>([
    { description: "", accountCode: defaultAccount, amount: "", taxCode: "none" },
  ]);

  const [formErr, setFormErr] = useState<string | null>(null);
  const [formOk, setFormOk] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const [genMsg, setGenMsg] = useState<string | null>(null);
  const [genErr, setGenErr] = useState<string | null>(null);
  const [generating, startGen] = useTransition();

  const [rowErr, setRowErr] = useState<string | null>(null);
  const [rowPending, startRow] = useTransition();

  const preview = useMemo(() => {
    let sub = 0;
    let tax = 0;
    for (const l of lines) {
      const amt = Math.round((Number(l.amount) || 0) * 100);
      if (amt > 0) {
        sub += amt;
        tax += Math.round(amt * (TAX_RATES[l.taxCode] ?? 0));
      }
    }
    return { sub, tax, total: sub + tax };
  }, [lines]);

  const updateLine = (idx: number, patch: Partial<RecurringLineInput>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  return (
    <div className="flex flex-col gap-6">
      {canEdit && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
          {/* Setup card */}
          <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-5">
            <h2 className="m-0 text-[14px] font-semibold text-ink">{c.setupTitle}</h2>
            <p className="m-0 mt-1 text-[12.5px] text-muted">{c.setupLead}</p>

            {accounts.length === 0 ? (
              <p className="mt-4 text-[13px] text-muted">{c.noAccounts}</p>
            ) : (
              <form
                className="mt-4 flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  setFormErr(null);
                  setFormOk(null);
                  const matched = contacts.find((ct) => ct.name.toLowerCase() === partyInput.trim().toLowerCase());
                  startSave(async () => {
                    const r = await createRecurringAction(orgSlug, {
                      kind,
                      name,
                      contactId: matched?.id ?? "",
                      contactName: matched ? "" : partyInput.trim(),
                      frequency,
                      intervalCount,
                      startDate,
                      endDate,
                      occurrencesLimit,
                      dueOffsetDays,
                      numberPrefix,
                      autoRecord,
                      notes,
                      lines: lines.map((l) => ({
                        ...l,
                        accountCode: parseAccountCode(l.accountCode, accounts),
                      })),
                    });
                    if (r.ok) {
                      setFormOk(ms ? "Templat berulang dicipta." : `Created "${name.trim()}".`);
                      setName("");
                      setPartyInput("");
                      setEndDate("");
                      setOccurrencesLimit("");
                      setNotes("");
                      setLines([{ description: "", accountCode: defaultAccount, amount: "", taxCode: "none" }]);
                      router.refresh();
                    } else {
                      setFormErr(r.error);
                    }
                  });
                }}
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="rec-name" className="text-[12.5px] font-medium text-ink-2">
                      {c.templateName}
                      <span className="ml-0.5 text-negative" aria-hidden="true">*</span>
                    </label>
                    <Input
                      id="rec-name"
                      required
                      placeholder={c.templateNamePlaceholder}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="rec-party" className="text-[12.5px] font-medium text-ink-2">
                      {c.thParty}
                      <span className="ml-0.5 text-negative" aria-hidden="true">*</span>
                    </label>
                    <Input
                      id="rec-party"
                      list={contactListId}
                      required
                      placeholder={c.partyPlaceholder}
                      value={partyInput}
                      onChange={(e) => setPartyInput(e.target.value)}
                    />
                    <datalist id={contactListId}>
                      {contacts.map((ct) => (
                        <option key={ct.id} value={ct.name} />
                      ))}
                    </datalist>
                    <span className="text-[11.5px] text-muted">{c.partyHint}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="rec-freq" className="text-[12.5px] font-medium text-ink-2">
                      {c.frequency}
                    </label>
                    <Select
                      id="rec-freq"
                      value={frequency}
                      onChange={(e) => setFrequency(e.target.value as Frequency)}
                    >
                      <option value="weekly">{c.freqLabel("weekly", 1)}</option>
                      <option value="monthly">{c.freqLabel("monthly", 1)}</option>
                      <option value="quarterly">{c.freqLabel("quarterly", 1)}</option>
                      <option value="yearly">{c.freqLabel("yearly", 1)}</option>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="rec-every" className="text-[12.5px] font-medium text-ink-2">
                      {c.every}
                    </label>
                    <Input
                      id="rec-every"
                      type="number"
                      min={1}
                      max={36}
                      required
                      value={intervalCount}
                      onChange={(e) => setIntervalCount(e.target.value)}
                    />
                    <span className="text-[11px] text-muted">{c.everyHint}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="rec-start" className="text-[12.5px] font-medium text-ink-2">
                      {c.startDate}
                      <span className="ml-0.5 text-negative" aria-hidden="true">*</span>
                    </label>
                    <Input
                      id="rec-start"
                      type="date"
                      required
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                    <span className="text-[11px] text-muted">{c.startDateHint}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="rec-end" className="text-[12.5px] font-medium text-ink-2">
                      {c.endDate}
                    </label>
                    <Input
                      id="rec-end"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                    <span className="text-[11px] text-muted">{c.endDateHint}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="rec-limit" className="text-[12.5px] font-medium text-ink-2">
                      {c.occurrences}
                    </label>
                    <Input
                      id="rec-limit"
                      type="number"
                      min={1}
                      max={999}
                      placeholder="e.g. 12"
                      value={occurrencesLimit}
                      onChange={(e) => setOccurrencesLimit(e.target.value)}
                    />
                    <span className="text-[11px] text-muted">{c.occurrencesHint}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="rec-due" className="text-[12.5px] font-medium text-ink-2">
                      {c.dueOffset}
                    </label>
                    <Input
                      id="rec-due"
                      type="number"
                      min={0}
                      max={365}
                      required
                      value={dueOffsetDays}
                      onChange={(e) => setDueOffsetDays(e.target.value)}
                    />
                    <span className="text-[11px] text-muted">{c.dueOffsetHint}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="rec-prefix" className="text-[12.5px] font-medium text-ink-2">
                      {c.prefix}
                      <span className="ml-0.5 text-negative" aria-hidden="true">*</span>
                    </label>
                    <Input
                      id="rec-prefix"
                      required
                      maxLength={30}
                      value={numberPrefix}
                      onChange={(e) => setNumberPrefix(e.target.value)}
                    />
                    <span className="text-[11px] text-muted">{c.prefixHint}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="inline-flex w-fit cursor-pointer items-center gap-2 text-[13px] font-medium text-ink">
                    <input
                      type="checkbox"
                      className="accent-brand"
                      checked={autoRecord}
                      onChange={(e) => setAutoRecord(e.target.checked)}
                    />
                    {c.recordAutomatically}
                  </label>
                  <span className="text-[11.5px] text-muted">{c.autoRecordHint}</span>
                </div>

                {/* Lines */}
                <div className="flex flex-col gap-2 border-t border-border pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] font-semibold text-ink">{c.lines}</span>
                    <span className="num text-[12.5px] text-muted">
                      {ms ? "Jumlah / larian" : "Total / run"}:{" "}
                      <strong className="font-semibold text-ink">{rm(preview.total)}</strong>
                    </span>
                  </div>
                  <datalist id={accountListId}>
                    {accounts.map((a) => (
                      <option key={a.code} value={`${a.code} · ${a.name}`} />
                    ))}
                  </datalist>

                  {lines.map((l, idx) => (
                    <div key={idx} className="grid grid-cols-1 gap-2 sm:grid-cols-12 sm:items-center">
                      <div className="sm:col-span-4">
                        <Input
                          aria-label={`Line ${idx + 1} description`}
                          placeholder={c.description}
                          required
                          value={l.description}
                          onChange={(e) => updateLine(idx, { description: e.target.value })}
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <Input
                          aria-label={`Line ${idx + 1} account`}
                          list={accountListId}
                          placeholder={ms ? "Cari akaun..." : "Find account by name..."}
                          required
                          value={l.accountCode}
                          onChange={(e) => updateLine(idx, { accountCode: e.target.value })}
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
                          onChange={(e) => updateLine(idx, { amount: e.target.value })}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Select
                          aria-label={`Line ${idx + 1} tax`}
                          value={l.taxCode}
                          onChange={(e) => updateLine(idx, { taxCode: e.target.value })}
                        >
                          {c.taxOptions.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="flex justify-end sm:col-span-1">
                        {lines.length > 1 && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                          >
                            {c.remove}
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
                      onClick={() =>
                        setLines((prev) => [
                          ...prev,
                          { description: "", accountCode: defaultAccount, amount: "", taxCode: "none" },
                        ])
                      }
                    >
                      {c.addLine}
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="rec-notes" className="text-[12.5px] font-medium text-ink-2">
                    {c.notes}
                  </label>
                  <Input
                    id="rec-notes"
                    placeholder={c.notesPlaceholder}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                  <span className="text-[11px] text-muted">{c.notesHint}</span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div>
                    {formErr && (
                      <p role="alert" className="m-0 text-[12.5px] text-negative">
                        {formErr}
                      </p>
                    )}
                    {formOk && (
                      <p role="status" className="m-0 text-[12.5px] font-medium text-positive">
                        {formOk}
                      </p>
                    )}
                  </div>
                  <Button type="submit" size="sm" disabled={saving}>
                    {saving ? c.saving : c.createBtn}
                  </Button>
                </div>
              </form>
            )}
          </section>

          {/* Generate due now card */}
          <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-5">
            <h2 className="m-0 text-[14px] font-semibold text-ink">{c.generateTitle}</h2>
            <p className="m-0 text-[12.5px] leading-relaxed text-muted">{c.generateLead}</p>
            <div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={generating}
                onClick={() => {
                  setGenMsg(null);
                  setGenErr(null);
                  startGen(async () => {
                    const r = await generateDueRecurringAction(orgSlug, kind);
                    if (r.ok) {
                      setGenMsg(c.resultText(r.evaluated, r.generated, r.recorded));
                      router.refresh();
                    } else {
                      setGenErr(r.error);
                    }
                  });
                }}
              >
                {generating ? c.generating : c.generateNow}
              </Button>
            </div>
            {genMsg && (
              <p role="status" className="m-0 text-[12.5px] font-medium text-positive" data-testid="generate-result">
                {genMsg}
              </p>
            )}
            {genErr && (
              <p role="alert" className="m-0 text-[12.5px] text-negative">
                {genErr}
              </p>
            )}
          </section>
        </div>
      )}

      {/* Templates table */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="m-0 text-[14px] font-semibold text-ink">{c.templatesHeading}</h2>
          {rowErr && (
            <p role="alert" className="m-0 text-[12.5px] text-negative">
              {rowErr}
            </p>
          )}
        </div>
        {templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 rounded-[var(--radius-lg)] border border-dashed border-border py-10 text-center">
            <p className="m-0 text-[13.5px] font-medium text-ink">{c.emptyTitle}</p>
            <p className="m-0 text-[12.5px] text-muted">{c.emptyBody}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
            <table className="w-full border-collapse text-[13px]" data-testid="recurring-templates">
              <thead className="bg-surface">
                <tr>
                  <th className={cn(TH, "text-left")}>{c.thTemplate}</th>
                  <th className={cn(TH, "text-left")}>{c.thParty}</th>
                  <th className={cn(TH, "text-left")}>{c.thFrequency}</th>
                  <th className={cn(TH, "text-left")}>{c.thNextRun}</th>
                  <th className={cn(TH, "text-right")}>{c.thAmount}</th>
                  <th className={cn(TH, "text-left")}>{c.thRecording}</th>
                  <th className={cn(TH, "text-left")}>{c.thStatus}</th>
                  <th className={cn(TH, "text-right")}>{c.thControls}</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => {
                  const [chip, enLabel, msLabel] = STATUS_CHIP[t.status];
                  const act = (next: "paused" | "active" | "cancelled") => {
                    setRowErr(null);
                    startRow(async () => {
                      const r = await setRecurringStatusAction(orgSlug, kind, t.id, next);
                      if (r.ok) router.refresh();
                      else setRowErr(r.error);
                    });
                  };
                  return (
                    <tr key={t.id} className="border-t border-border transition-colors hover:bg-surface-2">
                      <td className={cn(TD, "py-2")}>
                        <div className="font-medium text-ink">{t.name}</div>
                        <div className="num text-[11.5px] text-muted">
                          {t.numberPrefix} · {t.occurrencesGenerated}
                          {t.occurrencesLimit ? ` / ${t.occurrencesLimit}` : ""} {ms ? "larian" : "runs"}
                        </div>
                      </td>
                      <td className={cn(TD, "text-ink-2")}>{t.contactName}</td>
                      <td className={cn(TD, "whitespace-nowrap text-ink-2")}>
                        {c.freqLabel(t.frequency, t.intervalCount)}
                      </td>
                      <td className={cn(TD, "num whitespace-nowrap text-ink-2")}>{t.nextRunOn ?? "–"}</td>
                      <td className={cn(TD, "num-sans whitespace-nowrap text-right text-ink")}>{rm(t.totalSen)}</td>
                      <td className={cn(TD, "whitespace-nowrap")}>
                        <span className={t.autoRecord ? "chip brand" : "chip"}>
                          {t.autoRecord ? c.autoRecord : c.draft}
                        </span>
                      </td>
                      <td className={cn(TD, "whitespace-nowrap")}>
                        <span className={chip}>{ms ? msLabel : enLabel}</span>
                      </td>
                      <td className={cn(TD, "whitespace-nowrap text-right")}>
                        {canEdit && (t.status === "active" || t.status === "paused") && (
                          <div className="inline-flex items-center gap-1">
                            {t.status === "active" ? (
                              <Button size="sm" variant="ghost" disabled={rowPending} onClick={() => act("paused")}>
                                {c.pause}
                              </Button>
                            ) : (
                              <Button size="sm" variant="ghost" disabled={rowPending} onClick={() => act("active")}>
                                {c.resume}
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" disabled={rowPending} onClick={() => act("cancelled")}>
                              {c.cancel}
                            </Button>
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

      {/* Recent runs table */}
      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-[14px] font-semibold text-ink">{c.runsHeading}</h2>
        {runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 rounded-[var(--radius-lg)] border border-dashed border-border py-10 text-center">
            <p className="m-0 text-[13.5px] font-medium text-ink">{c.runsEmptyTitle}</p>
            <p className="m-0 text-[12.5px] text-muted">{c.runsEmptyBody}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
            <table className="w-full border-collapse text-[13px]" data-testid="recurring-runs">
              <thead className="bg-surface">
                <tr>
                  <th className={cn(TH, "text-left")}>{c.thScheduled}</th>
                  <th className={cn(TH, "text-left")}>{c.thTemplate}</th>
                  <th className={cn(TH, "text-left")}>{c.thDoc}</th>
                  <th className={cn(TH, "text-left")}>{c.thStatus}</th>
                  <th className={cn(TH, "text-left")}>{c.thDetail}</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const href = r.docId
                    ? kind === "invoice"
                      ? `${base}/invoices/${r.docId}`
                      : `${base}/bills/${r.docId}`
                    : null;
                  const chip = r.status === "recorded" ? "chip pos" : r.status === "failed" ? "chip neg" : "chip";
                  const label = r.status === "recorded" ? c.recorded : r.status === "failed" ? c.failed : c.draft;
                  return (
                    <tr key={r.id} className="border-t border-border transition-colors hover:bg-surface-2">
                      <td className={cn(TD, "num whitespace-nowrap text-ink-2")}>{r.scheduledOn}</td>
                      <td className={cn(TD, "text-ink")}>{r.templateName}</td>
                      <td className={cn(TD, "whitespace-nowrap")}>
                        {href ? (
                          <Link href={href} className="font-medium text-brand hover:underline">
                            {c.viewDoc}
                          </Link>
                        ) : (
                          <span className="text-muted">–</span>
                        )}
                      </td>
                      <td className={cn(TD, "whitespace-nowrap")}>
                        <span className={chip}>{label}</span>
                      </td>
                      <td className={cn(TD, "text-[12.5px] text-muted")}>
                        {r.error ? <span className="text-negative">{r.error}</span> : <span className="num">{r.docNumber ?? "-"}</span>}
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
