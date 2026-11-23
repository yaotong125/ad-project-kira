"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { AccountCombobox } from "@/features/books/account-combobox";
import type { AccountOption } from "@/features/books/load";
import { rm, toSen } from "@/features/books/money";
import type { Lang } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Input, Select } from "@/shared/ui/form-controls";
import { saveQuoteAction } from "./actions";
import { qt } from "./copy";
import type { QuotesTextKey } from "./copy-data";

const TAX_CODES = ["none", "sst_6", "sst_8", "sales_5", "sales_10", "exempt"] as const;
const RATE: Record<string, number> = { none: 0, sst_6: 6, sst_8: 8, sales_5: 5, sales_10: 10, exempt: 0 };
const LABEL = "text-[13px] font-medium text-ink-2";
type Line = { key: number; description: string; accountCode: string; amount: string; taxCode: string };

export type QuoteFormInitial = {
  id?: string;
  customer: string;
  number: string;
  date: string;
  expires: string;
  notes: string;
  lines: { description: string; accountCode: string; amount: string; taxCode: string }[];
};

/**
 * lejar.ai's "Draft a quote" form (observed 2026-11-23): Customer (search or add), Quote number ("Assigned when
 * saved." / "Use my own number"), Quote date*, Expiry (optional), Lines (description, account, amount, tax),
 * Add line, Notes (optional), "Save draft quote" / "Save changes". MYR only, no instalments in Kira yet.
 */
export function QuoteForm(props: { slug: string; lang: Lang; accounts: AccountOption[]; customers: string[]; nextNumber: string; initial: QuoteFormInitial; editingPosted?: boolean }) {
  const t = (k: QuotesTextKey, v?: Record<string, string | number>) => qt(props.lang, k, v);
  const router = useRouter();
  const listId = useId();
  const lineAccounts = props.accounts.filter((a) => !a.isCash && a.type !== "equity");
  const defaultAccount = lineAccounts.find((a) => a.code === "600-0000")?.code ?? lineAccounts[0]?.code ?? "";
  const editing = Boolean(props.initial.id);
  const [customer, setCustomer] = useState(props.initial.customer);
  const [ownNumber, setOwnNumber] = useState(editing);
  const [number, setNumber] = useState(props.initial.number);
  const [date, setDate] = useState(props.initial.date);
  const [expires, setExpires] = useState(props.initial.expires);
  const [notes, setNotes] = useState(props.initial.notes);
  const [lines, setLines] = useState<Line[]>(
    props.initial.lines.length ? props.initial.lines.map((l, i) => ({ key: i, ...l })) : [{ key: 0, description: "", accountCode: defaultAccount, amount: "", taxCode: "none" }],
  );
  const [seq, setSeq] = useState(lines.length);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const sub = lines.reduce((s, l) => s + (toSen(l.amount) ?? 0), 0);
  const tax = lines.reduce((s, l) => s + Math.round(((toSen(l.amount) ?? 0) * RATE[l.taxCode]) / 100), 0);

  return (
    <form
      className="flex flex-col gap-4"
      data-testid="quote-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await saveQuoteAction(props.slug, {
            quoteId: props.initial.id,
            customerName: customer,
            quoteNumber: ownNumber ? number : "",
            quoteDate: date,
            expiresOn: expires,
            notes,
            lines: lines.map((l) => ({ description: l.description, accountCode: l.accountCode, amount: l.amount.replace(/,/g, ""), taxCode: l.taxCode })),
          });
          if (r.ok) router.push(`/${props.slug}/quotes/${r.data}`);
          else setError(r.error);
        });
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="quote-customer" className={LABEL}>
            {t("quotes.form.customer")}
          </label>
          <Input id="quote-customer" list={listId} required placeholder={t("quotes.form.customerPlaceholder")} value={customer} onChange={(e) => setCustomer(e.target.value)} />
          <datalist id={listId}>
            {props.customers.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <p className="text-[12.5px] text-muted">{t("quotes.form.customerHint")}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="quote-number" className={LABEL}>
            {t("quotes.form.quoteNumber")}
          </label>
          <Input id="quote-number" value={ownNumber ? number : props.nextNumber} readOnly={!ownNumber || props.editingPosted} className={ownNumber && !props.editingPosted ? "" : "bg-surface-2 text-muted"} onChange={(e) => setNumber(e.target.value)} />
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
          <label htmlFor="quote-date" className={LABEL}>
            {t("quotes.form.quoteDate")}
            <span className="ml-0.5 text-negative" aria-hidden="true">
              *
            </span>
          </label>
          <Input id="quote-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="quote-expiry" className={LABEL}>
            {t("quotes.form.expiry")}
          </label>
          <Input id="quote-expiry" type="date" min={date} value={expires} onChange={(e) => setExpires(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className={LABEL}>{t("quotes.form.lines")}</div>
        {lines.map((l, i) => (
          <div key={l.key} className="grid grid-cols-1 gap-2 md:grid-cols-[1.6fr_1.3fr_0.8fr_0.9fr_auto] md:items-center">
            <Input aria-label={t("quotes.form.aria.description", { n: i + 1 })} placeholder={t("quotes.form.description")} value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} />
            <AccountCombobox ariaLabel={`Line ${i + 1} account`} accounts={lineAccounts} value={l.accountCode} onChange={(c) => update(l.key, { accountCode: c })} placeholder={t("quotes.form.accountPlaceholder")} />
            <Input aria-label={t("quotes.form.aria.amount", { n: i + 1 })} inputMode="decimal" placeholder="0.00" className="text-right" value={l.amount} onChange={(e) => update(l.key, { amount: e.target.value })} />
            <Select aria-label={t("quotes.form.aria.tax", { n: i + 1 })} value={l.taxCode} onChange={(e) => update(l.key, { taxCode: e.target.value })}>
              {TAX_CODES.map((c) => (
                <option key={c} value={c}>
                  {t(`quotes.form.tax.${c}`)}
                </option>
              ))}
            </Select>
            <Button type="button" variant="ghost" size="sm" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
              {t("quotes.form.remove")}
            </Button>
          </div>
        ))}
        <div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setLines((ls) => [...ls, { key: seq, description: "", accountCode: defaultAccount, amount: "", taxCode: "none" }]);
              setSeq((s) => s + 1);
            }}
          >
            {t("quotes.form.addLine")}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="quote-notes" className={LABEL}>
          {t("quotes.form.notes")} <span className="font-normal text-muted">({t("quotes.form.optional")})</span>
        </label>
        <Input id="quote-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {error && (
        <p role="alert" className="text-[12.5px] text-negative">
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-4">
        <span className="num-sans text-[13px] text-ink-2" data-testid="quote-form-total">
          Subtotal {rm(sub)} · SST {rm(tax)} · Total {rm(sub + tax)}
        </span>
        <Button type="submit" disabled={pending}>
          {pending ? t("quotes.form.saving") : editing ? t("quotes.form.saveChanges") : t("quotes.form.saveDraft")}
        </Button>
      </div>
    </form>
  );
}
