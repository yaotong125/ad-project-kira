"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AccountCombobox } from "@/features/books/account-combobox";
import type { AccountOption } from "@/features/books/load";
import { rm, toQuantity, toSen } from "@/features/books/money";
import type { Lang } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Input, Select } from "@/shared/ui/form-controls";
import { saveNoteAction } from "./actions";
import { nt } from "./copy";
import type { NotesTextKey } from "./copy-data";
import type { NoteInvoice, NoteKind } from "./load";

const TAX_CODES = ["none", "sst_6", "sst_8", "sales_5", "sales_10", "exempt"] as const;
const RATE: Record<string, number> = { none: 0, sst_6: 6, sst_8: 8, sales_5: 5, sales_10: 10, exempt: 0 };
const LABEL = "text-[13px] font-medium text-ink-2";
type Line = { key: number; description: string; accountCode: string; quantity: string; amount: string; taxCode: string };

/**
 * lejar.ai's "Issue a note" form (observed 2026-11-23): against invoice + creditable balance, Kind, Note number
 * ("Assigned when saved." / "Use my own number"), Note date*, Bank account (refund), Reason*, Lines
 * (description, account, qty, amount, tax), Add line, Save note. Kira has no price book yet, so lines are freehand.
 */
export function NoteForm(props: {
  slug: string;
  lang: Lang;
  invoice: NoteInvoice;
  kind: NoteKind;
  today: string;
  accounts: AccountOption[];
  banks: AccountOption[];
  nextNumbers: Record<NoteKind, string>;
}) {
  const t = (k: NotesTextKey, v?: Record<string, string | number>) => nt(props.lang, k, v);
  const router = useRouter();
  const lineAccounts = props.accounts.filter((a) => !a.isCash);
  const [kind, setKind] = useState<NoteKind>(props.kind);
  const [ownNumber, setOwnNumber] = useState(false);
  const [number, setNumber] = useState("");
  const [date, setDate] = useState(props.today);
  const [bank, setBank] = useState(props.banks[0]?.code ?? "");
  const [reason, setReason] = useState("");
  const [seq, setSeq] = useState(1);
  const blank = (key: number): Line => ({ key, description: "", accountCode: props.invoice.firstAccount ?? lineAccounts.find((a) => a.code === "600-0000")?.code ?? "", quantity: "1", amount: "", taxCode: "none" });
  const [lines, setLines] = useState<Line[]>([blank(0)]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const lineNet = (l: Line) => {
    const q = toQuantity(l.quantity) ?? 0;
    const a = toSen(l.amount) ?? 0;
    return Math.round(q * a);
  };
  const total = lines.reduce((s, l) => s + lineNet(l) + Math.round((lineNet(l) * RATE[l.taxCode]) / 100), 0);
  const limit = kind === "debit" ? null : props.invoice.creditable;

  return (
    <div className="card p-4">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const r = await saveNoteAction(props.slug, {
              invoiceId: props.invoice.id,
              kind,
              noteNumber: ownNumber ? number : "",
              noteDate: date,
              reason,
              bankAccountCode: kind === "refund" ? bank : "",
              lines: lines.map((l) => ({ description: l.description, accountCode: l.accountCode, quantity: l.quantity, amount: l.amount.replace(/,/g, ""), taxCode: l.taxCode })),
            });
            if (r.ok) router.push(`/${props.slug}/notes/${r.data}?saved=1`);
            else setError(r.error);
          });
        }}
      >
        <div className="flex flex-col gap-1 text-[13px]">
          <div className="text-ink-2">
            {t("notes.form.against")} <span className="font-medium text-ink">{props.invoice.number}</span>
          </div>
          <div className="text-ink-2" data-testid="creditable">
            {t("notes.form.creditable")} <span className="font-medium text-ink">{rm(props.invoice.creditable)}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="note-kind" className={LABEL}>
              {t("notes.form.kind")}
            </label>
            <Select id="note-kind" value={kind} onChange={(e) => setKind(e.target.value as NoteKind)}>
              <option value="credit">{t("notes.kind.credit")}</option>
              <option value="debit">{t("notes.kind.debit")}</option>
              <option value="refund">{t("notes.kind.refund")}</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="note-number" className={LABEL}>
              {t("notes.form.noteNumber")}
            </label>
            <Input id="note-number" value={ownNumber ? number : props.nextNumbers[kind]} readOnly={!ownNumber} className={ownNumber ? "" : "bg-surface-2 text-muted"} onChange={(e) => setNumber(e.target.value)} />
            {!ownNumber && (
              <p className="text-[12.5px] text-muted">
                {props.lang === "ms" ? "Diberikan semasa disimpan." : "Assigned when saved."}{" "}
                <button type="button" className="text-ink underline underline-offset-2" onClick={() => setOwnNumber(true)}>
                  {props.lang === "ms" ? "Guna nombor saya sendiri" : "Use my own number"}
                </button>
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="note-date" className={LABEL}>
              {t("notes.form.noteDate")}
              <span className="ml-0.5 text-negative" aria-hidden="true">
                *
              </span>
            </label>
            <Input id="note-date" type="date" required min={props.invoice.date} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        {kind === "refund" && (
          <div className="flex max-w-md flex-col gap-1.5">
            <label htmlFor="note-bank" className={LABEL}>
              {t("notes.form.bankAccount")}
            </label>
            <AccountCombobox id="note-bank" accounts={props.banks} value={bank} onChange={setBank} placeholder={t("notes.form.accountPlaceholder")} />
            <p className="text-[12.5px] text-muted">{t("notes.form.bankHint")}</p>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="note-reason" className={LABEL}>
            {t("notes.form.reason")}
            <span className="ml-0.5 text-negative" aria-hidden="true">
              *
            </span>
          </label>
          <Input id="note-reason" required placeholder={t("notes.form.reasonPlaceholder")} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>

        <div className="flex flex-col gap-2">
          <div className={LABEL}>{t("notes.form.lines")}</div>
          {lines.map((l, i) => (
            <div key={l.key} className="grid grid-cols-1 gap-2 md:grid-cols-[1.4fr_1.2fr_0.5fr_0.8fr_0.9fr_auto] md:items-center">
              <Input aria-label={t("notes.form.aria.description", { n: i + 1 })} placeholder={t("notes.form.description")} value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} />
              <AccountCombobox ariaLabel={`Line ${i + 1} account`} accounts={lineAccounts} value={l.accountCode} onChange={(c) => update(l.key, { accountCode: c })} placeholder={t("notes.form.accountPlaceholder")} />
              <Input aria-label={t("notes.form.aria.quantity", { n: i + 1 })} inputMode="decimal" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} />
              <Input aria-label={t("notes.form.aria.amount", { n: i + 1 })} inputMode="decimal" placeholder="0.00" className="text-right" value={l.amount} onChange={(e) => update(l.key, { amount: e.target.value })} />
              <Select aria-label={t("notes.form.aria.tax", { n: i + 1 })} value={l.taxCode} onChange={(e) => update(l.key, { taxCode: e.target.value })}>
                {TAX_CODES.map((c) => (
                  <option key={c} value={c}>
                    {t(`notes.tax.${c}`)}
                  </option>
                ))}
              </Select>
              <Button type="button" variant="ghost" size="sm" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                {t("notes.form.remove")}
              </Button>
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setLines((ls) => [...ls, blank(seq)]);
                setSeq((s) => s + 1);
              }}
            >
              {t("notes.form.addLine")}
            </Button>
          </div>
        </div>

        {limit != null && total > limit && (
          <p role="alert" className="text-[12.5px] text-negative">
            {t("notes.form.exceeds", { amount: rm(limit) })}
          </p>
        )}
        {error && (
          <p role="alert" className="text-[12.5px] text-negative">
            {error}
          </p>
        )}
        <div className="flex items-center justify-end gap-3">
          <span className="num-sans text-[13px] text-ink-2" data-testid="note-total">
            Total {rm(total)}
          </span>
          <Button type="submit" disabled={pending}>
            {pending ? t("notes.form.saving") : t("notes.form.save")}
          </Button>
        </div>
      </form>
    </div>
  );
}
