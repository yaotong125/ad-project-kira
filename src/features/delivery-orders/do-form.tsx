"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { AccountCombobox } from "@/features/books/account-combobox";
import type { AccountOption } from "@/features/books/load";
import { rm, toQuantity, toSen } from "@/features/books/money";
import type { Lang } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Input, Select } from "@/shared/ui/form-controls";
import { saveDoAction } from "./actions";
import { dot } from "./copy";
import type { DoTextKey } from "./copy-data";

const TAX_CODES = ["none", "sst_6", "sst_8", "sales_5", "sales_10", "exempt"] as const;
const RATE: Record<string, number> = { none: 0, sst_6: 6, sst_8: 8, sales_5: 5, sales_10: 10, exempt: 0 };
const LABEL = "text-[13px] font-medium text-ink-2";
type Line = { key: number; description: string; accountCode: string; quantity: string; amount: string; taxCode: string };

export type DoFormInitial = {
  id?: string;
  customer: string;
  number: string;
  date: string;
  notes: string;
  lines: { description: string; accountCode: string; quantity: string; amount: string; taxCode: string }[];
};

/**
 * lejar.ai's "Create a delivery order" form (observed 2026-11-23): Customer, Delivery order number ("Assigned when
 * saved." / "Use my own number"), Delivery order date*, Lines (description, account, qty, amount, tax), Notes,
 * "Save delivery order". MYR only and no price book in Kira yet.
 */
export function DoForm(props: { slug: string; lang: Lang; accounts: AccountOption[]; customers: string[]; nextNumber: string; initial: DoFormInitial }) {
  const t = (k: DoTextKey, v?: Record<string, string | number>) => dot(props.lang, k, v);
  const router = useRouter();
  const listId = useId();
  const lineAccounts = props.accounts.filter((a) => !a.isCash && a.type !== "equity");
  const defaultAccount = lineAccounts.find((a) => a.code === "600-0000")?.code ?? lineAccounts[0]?.code ?? "";
  const editing = Boolean(props.initial.id);
  const blank = (key: number): Line => ({ key, description: "", accountCode: defaultAccount, quantity: "1", amount: "", taxCode: "none" });
  const [customer, setCustomer] = useState(props.initial.customer);
  const [ownNumber, setOwnNumber] = useState(editing);
  const [number, setNumber] = useState(props.initial.number);
  const [date, setDate] = useState(props.initial.date);
  const [notes, setNotes] = useState(props.initial.notes);
  const [lines, setLines] = useState<Line[]>(props.initial.lines.length ? props.initial.lines.map((l, i) => ({ key: i, ...l })) : [blank(0)]);
  const [seq, setSeq] = useState(lines.length);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const net = (l: Line) => Math.round((toQuantity(l.quantity) ?? 0) * (toSen(l.amount) ?? 0));
  const sub = lines.reduce((s, l) => s + net(l), 0);
  const tax = lines.reduce((s, l) => s + Math.round((net(l) * RATE[l.taxCode]) / 100), 0);

  return (
    <form
      className="flex flex-col gap-4"
      data-testid="do-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await saveDoAction(props.slug, {
            doId: props.initial.id,
            customerName: customer,
            doNumber: ownNumber ? number : "",
            doDate: date,
            notes,
            lines: lines.map((l) => ({ description: l.description, accountCode: l.accountCode, quantity: l.quantity, amount: l.amount.replace(/,/g, ""), taxCode: l.taxCode })),
          });
          if (r.ok) router.push(`/${props.slug}/delivery-orders/${r.data}`);
          else setError(r.error);
        });
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="do-customer" className={LABEL}>
            {t("deliveryOrders.form.customer")}
          </label>
          <Input id="do-customer" list={listId} required placeholder={t("deliveryOrders.form.customerPlaceholder")} value={customer} onChange={(e) => setCustomer(e.target.value)} />
          <datalist id={listId}>
            {props.customers.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <p className="text-[12.5px] text-muted">{t("deliveryOrders.form.customerHint")}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="do-number" className={LABEL}>
            {t("deliveryOrders.form.number")}
          </label>
          <Input id="do-number" value={ownNumber ? number : props.nextNumber} readOnly={!ownNumber} className={ownNumber ? "" : "bg-surface-2 text-muted"} onChange={(e) => setNumber(e.target.value)} />
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
          <label htmlFor="do-date" className={LABEL}>
            {t("deliveryOrders.form.date")}
            <span className="ml-0.5 text-negative" aria-hidden="true">
              *
            </span>
          </label>
          <Input id="do-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className={LABEL}>{t("deliveryOrders.form.lines")}</div>
        {lines.map((l, i) => (
          <div key={l.key} className="grid grid-cols-1 gap-2 md:grid-cols-[1.6fr_1.3fr_0.5fr_0.8fr_0.9fr_auto] md:items-center">
            <Input aria-label={t("deliveryOrders.form.aria.description", { n: i + 1 })} placeholder={t("deliveryOrders.form.description")} value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} />
            <AccountCombobox ariaLabel={`Line ${i + 1} account`} accounts={lineAccounts} value={l.accountCode} onChange={(c) => update(l.key, { accountCode: c })} placeholder={t("deliveryOrders.form.accountPlaceholder")} />
            <Input aria-label={t("deliveryOrders.form.aria.quantity", { n: i + 1 })} inputMode="decimal" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} />
            <Input aria-label={t("deliveryOrders.form.aria.amount", { n: i + 1 })} inputMode="decimal" placeholder="0.00" className="text-right" value={l.amount} onChange={(e) => update(l.key, { amount: e.target.value })} />
            <Select aria-label={t("deliveryOrders.form.aria.tax", { n: i + 1 })} value={l.taxCode} onChange={(e) => update(l.key, { taxCode: e.target.value })}>
              {TAX_CODES.map((c) => (
                <option key={c} value={c}>
                  {t(`deliveryOrders.form.tax.${c}`)}
                </option>
              ))}
            </Select>
            <Button type="button" variant="ghost" size="sm" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
              {t("deliveryOrders.form.remove")}
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
            {t("deliveryOrders.form.addLine")}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="do-notes" className={LABEL}>
          {t("deliveryOrders.form.notes")} <span className="font-normal text-muted">({t("deliveryOrders.form.optional")})</span>
        </label>
        <Input id="do-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {error && (
        <p role="alert" className="text-[12.5px] text-negative">
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-4">
        <span className="num-sans text-[13px] text-ink-2" data-testid="do-form-total">
          Subtotal {rm(sub)} · SST {rm(tax)} · Total {rm(sub + tax)}
        </span>
        <Button type="submit" disabled={pending}>
          {pending ? t("deliveryOrders.form.saving") : editing ? t("deliveryOrders.form.saveChanges") : t("deliveryOrders.form.save")}
        </Button>
      </div>
    </form>
  );
}
