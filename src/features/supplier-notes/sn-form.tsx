"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AccountCombobox } from "@/features/books/account-combobox";
import type { AccountOption } from "@/features/books/load";
import { rm, toQuantity, toSen } from "@/features/books/money";
import type { Lang } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Input, Select } from "@/shared/ui/form-controls";
import { saveSnAction } from "./actions";
import { st } from "./copy";
import type { SnTextKey } from "./copy-data";
import type { SnKind } from "./load";

const TAX_CODES = ["none", "sst_6", "sst_8", "sales_5", "sales_10", "exempt"] as const;
const RATE: Record<string, number> = { none: 0, sst_6: 6, sst_8: 8, sales_5: 5, sales_10: 10, exempt: 0 };
const LABEL = "text-[13px] font-medium text-ink-2";
type Line = { key: number; description: string; accountCode: string; quantity: string; amount: string; taxCode: string };

/**
 * lejar.ai's "Record a supplier credit / debit note" form (observed 2026-11-23): against bill + creditable balance,
 * Kind, Note number (SCN-… "Assigned when saved."), Note date*, Reason*, Lines (description, account, qty, amount,
 * tax), Save note. Lines start from the bill's own lines' account and tax ("the same account and the same SST tax
 * code as the original line on the bill").
 */
export function SnForm(props: {
  slug: string;
  lang: Lang;
  bill: { id: string; number: string; date: string; creditable: number; firstAccount: string; firstTax: string };
  kind: SnKind;
  today: string;
  accounts: AccountOption[];
  nextNumbers: Record<SnKind, string>;
}) {
  const t = (k: SnTextKey, v?: Record<string, string | number>) => st(props.lang, k, v);
  const router = useRouter();
  const lineAccounts = props.accounts.filter((a) => !a.isCash);
  const [kind, setKind] = useState<SnKind>(props.kind);
  const [ownNumber, setOwnNumber] = useState(false);
  const [number, setNumber] = useState("");
  const [date, setDate] = useState(props.today < props.bill.date ? props.bill.date : props.today);
  const [reason, setReason] = useState("");
  const blank = (key: number): Line => ({ key, description: "", accountCode: props.bill.firstAccount, quantity: "1", amount: "", taxCode: props.bill.firstTax });
  const [lines, setLines] = useState<Line[]>([blank(0)]);
  const [seq, setSeq] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const net = (l: Line) => Math.round((toQuantity(l.quantity) ?? 0) * (toSen(l.amount) ?? 0));
  const total = lines.reduce((s, l) => s + net(l) + Math.round((net(l) * RATE[l.taxCode]) / 100), 0);

  return (
    <div className="card p-4">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const r = await saveSnAction(props.slug, {
              billId: props.bill.id,
              kind,
              noteNumber: ownNumber ? number : "",
              noteDate: date,
              reason,
              lines: lines.map((l) => ({ description: l.description, accountCode: l.accountCode, quantity: l.quantity, amount: l.amount.replace(/,/g, ""), taxCode: l.taxCode })),
            });
            if (r.ok) router.push(`/${props.slug}/bills/notes/${r.data}`);
            else setError(r.error);
          });
        }}
      >
        <div className="flex flex-col gap-1 text-[13px]">
          <div className="text-ink-2">
            {t("supplierNotes.form.againstBill")} <span className="font-medium text-ink">{props.bill.number}</span>
          </div>
          <div className="text-ink-2" data-testid="sn-creditable">
            {t("supplierNotes.form.creditable")} <span className="font-medium text-ink">{rm(props.bill.creditable)}</span>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="sn-kind" className={LABEL}>
              {t("supplierNotes.form.kind")}
            </label>
            <Select id="sn-kind" value={kind} onChange={(e) => setKind(e.target.value as SnKind)}>
              <option value="credit">{t("supplierNotes.form.kind.credit")}</option>
              <option value="debit">{t("supplierNotes.form.kind.debit")}</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="sn-number" className={LABEL}>
              {t("supplierNotes.form.noteNumber")}
            </label>
            <Input id="sn-number" value={ownNumber ? number : props.nextNumbers[kind]} readOnly={!ownNumber} className={ownNumber ? "" : "bg-surface-2 text-muted"} onChange={(e) => setNumber(e.target.value)} />
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
            <label htmlFor="sn-date" className={LABEL}>
              {t("supplierNotes.form.noteDate")}
              <span className="ml-0.5 text-negative" aria-hidden="true">
                *
              </span>
            </label>
            <Input id="sn-date" type="date" required min={props.bill.date} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="sn-reason" className={LABEL}>
            {t("supplierNotes.form.reason")}
            <span className="ml-0.5 text-negative" aria-hidden="true">
              *
            </span>
          </label>
          <Input id="sn-reason" required placeholder={t("supplierNotes.form.reasonPlaceholder")} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <div className={LABEL}>{t("supplierNotes.form.lines")}</div>
          {lines.map((l, i) => (
            <div key={l.key} className="grid grid-cols-1 gap-2 md:grid-cols-[1.5fr_1.3fr_0.5fr_0.8fr_0.9fr_auto] md:items-center">
              <Input aria-label={t("supplierNotes.form.aria.description", { n: i + 1 })} placeholder={t("supplierNotes.form.description")} value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} />
              <AccountCombobox ariaLabel={`Line ${i + 1} account`} accounts={lineAccounts} value={l.accountCode} onChange={(c) => update(l.key, { accountCode: c })} placeholder={t("supplierNotes.form.accountPlaceholder")} />
              <Input aria-label={t("supplierNotes.form.aria.quantity", { n: i + 1 })} inputMode="decimal" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} />
              <Input aria-label={t("supplierNotes.form.aria.amount", { n: i + 1 })} inputMode="decimal" placeholder="0.00" className="text-right" value={l.amount} onChange={(e) => update(l.key, { amount: e.target.value })} />
              <Select aria-label={t("supplierNotes.form.aria.tax", { n: i + 1 })} value={l.taxCode} onChange={(e) => update(l.key, { taxCode: e.target.value })}>
                {TAX_CODES.map((c) => (
                  <option key={c} value={c}>
                    {t(`supplierNotes.tax.${c}`)}
                  </option>
                ))}
              </Select>
              <Button type="button" variant="ghost" size="sm" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                {t("supplierNotes.form.remove")}
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
              {t("supplierNotes.form.addLine")}
            </Button>
          </div>
        </div>
        {kind === "credit" && total > props.bill.creditable && (
          <p role="alert" className="text-[12.5px] text-negative">
            {t("supplierNotes.form.exceeds", { amount: rm(props.bill.creditable) })}
          </p>
        )}
        {error && (
          <p role="alert" className="text-[12.5px] text-negative">
            {error}
          </p>
        )}
        <div className="flex items-center justify-end gap-3">
          <span className="num-sans text-[13px] text-ink-2" data-testid="sn-total">
            Total {rm(total)}
          </span>
          <Button type="submit" disabled={pending}>
            {pending ? t("supplierNotes.form.saving") : t("supplierNotes.form.save")}
          </Button>
        </div>
      </form>
    </div>
  );
}
