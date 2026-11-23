"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";
import { AccountCombobox } from "@/features/books/account-combobox";
import { AiDraftBanner } from "@/features/books/ai-draft-banner";
import type { AccountOption, SourcePreview } from "@/features/books/load";
import { fromSen, toQuantity, toSen } from "@/features/books/money";
import { SourceDocument } from "@/features/books/source-preview";
import type { Lang } from "@/shared/i18n";
import { Button, buttonClass } from "@/shared/ui/button";
import { FormField, Input, Select } from "@/shared/ui/form-controls";
import { saveInvoiceAction, type InvoiceInput } from "./actions";
import { CLASSIFICATION_CODES } from "./copy-data";
import { vt } from "./copy";
import { blankLine, type FormLine } from "./lines";
import { discountByPercent, percentOf, splitTax, taxCodeOn, type PricingMode } from "./math";

export { blankLine, type FormLine };

export type Customer = { id: string; name: string; terms: number | null };

type Line = FormLine & { key: number };
export type InvoiceInitial = {
  invoiceId: string | null;
  customerName: string;
  invoiceNumber: string | null;
  invoiceDate: string;
  dueDate: string;
  pricingMode: PricingMode;
  notes: string;
  lines: FormLine[];
};

const TAX_CODES = ["none", "sst_6", "sst_8", "sales_5", "sales_10"] as const;
const DEFAULT_REVENUE = "600-0000";
const COL_HEAD = "hidden md:grid md:grid-cols-[repeat(18,minmax(0,1fr))] md:gap-2 text-[12px] font-medium text-muted";
const MOBILE_LABEL = "mb-1 block text-[13px] font-medium text-ink-2 md:hidden";



/** The unit price after the line's discount, in sen (null when the typed numbers are invalid). */
function discountedSen(l: FormLine): number | null {
  const price = toSen(l.unitPrice);
  if (price === null) return null;
  if (l.discountMode === "percent") {
    const pct = Number(l.discountPercent);
    return l.discountPercent.trim() && pct > 0 && pct < 100 ? discountByPercent(price, pct) : null;
  }
  if (l.discountMode === "amount") {
    const off = toSen(l.discountAmount);
    return off === null || off > price ? null : price - off;
  }
  if (l.discountMode === "price") {
    const p = toSen(l.discountedUnitPrice);
    return p === null || p > price ? null : p;
  }
  return price;
}

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * lejar.ai's "Raise an invoice" form (InvoiceForm, chunk 0cr-ss80p7flu, observed 2026-11-22): customer,
 * number, MYR, dates with 30/60/90d, prices excluding or including SST, lines with discount % / RM /
 * new price, tax and e-Invoice classification, Save draft or Save & record. Foreign currency, price book
 * items, instalments and exemption details are not in this slice.
 */
export function InvoiceForm({
  orgSlug,
  lang,
  accounts,
  customers,
  suggestedNumber,
  initial,
  draft,
  closeHref,
  title,
}: {
  orgSlug: string;
  lang: Lang;
  accounts: AccountOption[];
  customers: Customer[];
  suggestedNumber: string;
  initial: InvoiceInitial;
  draft: { id: string; confidence: number | null; printedTotal: string | null; sourceDocumentId: string; source: SourcePreview | null } | null;
  closeHref: string;
  title?: string;
}) {
  const t = (k: Parameters<typeof vt>[1], v?: Record<string, string | number>) => vt(lang, k, v);
  const router = useRouter();
  const ids = useId();
  const revenue = useMemo(() => accounts.filter((a) => a.type === "revenue"), [accounts]);
  const defaultRevenue = revenue.some((a) => a.code === DEFAULT_REVENUE) ? DEFAULT_REVENUE : (revenue[0]?.code ?? "");
  const editing = initial.invoiceId !== null;

  const [customer, setCustomer] = useState(initial.customerName);
  const [ownNumber, setOwnNumber] = useState(initial.invoiceNumber !== null && initial.invoiceNumber !== suggestedNumber);
  const [number, setNumber] = useState(initial.invoiceNumber ?? "");
  const [date, setDate] = useState(initial.invoiceDate);
  const [due, setDue] = useState(initial.dueDate);
  const [mode, setMode] = useState<PricingMode>(initial.pricingMode);
  const [notes, setNotes] = useState(initial.notes);
  const [seq, setSeq] = useState(initial.lines.length || 1);
  const [lines, setLines] = useState<Line[]>((initial.lines.length ? initial.lines : [blankLine(defaultRevenue)]).map((l, i) => ({ ...l, key: i })));
  const [gaps, setGaps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [intent, setIntent] = useState<"draft" | "record">("record");

  const match = customers.find((c) => c.name.toLowerCase() === customer.trim().toLowerCase());
  const update = (key: number, patch: Partial<FormLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const amounts = lines.map((l) => {
    const q = toQuantity(l.quantity);
    const d = discountedSen(l);
    if (q === null || d === null || l.unitPrice.trim() === "") return null;
    const amount = Math.round(q * d);
    return { amount, ...splitTax(amount, taxCodeOn(l.taxCode, date), mode) };
  });
  const net = amounts.reduce((s, a) => s + (a?.net ?? 0), 0);
  const tax = amounts.reduce((s, a) => s + (a?.tax ?? 0), 0);

  if (revenue.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-muted">{t("invoices.form.noAccounts")}</p>
      </div>
    );
  }

  const pickCustomer = (name: string) => {
    setCustomer(name);
    const c = customers.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
    // lejar.ai: the due date is seeded from the customer's payment terms.
    if (c && c.terms !== null && !due && date) setDue(addDays(date, c.terms));
  };

  const submit = (which: "draft" | "record") => {
    setIntent(which);
    const missing: string[] = [];
    if (!customer.trim()) missing.push(t("invoices.form.gap.customer"));
    if (lines.length === 0 || amounts.some((a) => a === null || a.amount <= 0) || lines.some((l) => !l.description.trim() || !l.accountCode)) {
      missing.push(t("invoices.form.gap.lineAmounts"));
    }
    if (!date) missing.push(t("invoices.form.gap.date"));
    if (ownNumber && !number.trim()) missing.push(t("invoices.form.gap.number"));
    if (due && date && due < date) missing.push(t("invoices.form.gap.dueBeforeDate"));
    setGaps(missing);
    setError(null);
    if (missing.length > 0) return;
    const input: InvoiceInput = {
      invoiceId: initial.invoiceId,
      customerContactId: match?.id ?? null,
      customerName: customer.trim(),
      invoiceNumber: ownNumber ? number.trim() : editing ? (initial.invoiceNumber ?? null) : null,
      invoiceDate: date,
      dueDate: due || null,
      pricingMode: mode,
      notes,
      aiDraftId: draft?.id ?? null,
      sourceDocumentId: draft?.sourceDocumentId ?? null,
      lines: lines.map((l) => ({
        description: l.description.trim(),
        accountCode: l.accountCode,
        quantity: String(toQuantity(l.quantity)),
        unitPrice: ((toSen(l.unitPrice) ?? 0) / 100).toFixed(2),
        discountMode: l.discountMode,
        discountPercent: l.discountPercent.trim(),
        discountAmount: l.discountMode === "amount" ? ((toSen(l.discountAmount) ?? 0) / 100).toFixed(2) : "",
        discountedUnitPrice: l.discountMode === "price" ? ((toSen(l.discountedUnitPrice) ?? 0) / 100).toFixed(2) : "",
        taxCode: l.taxCode,
        classificationCode: l.classificationCode,
      })),
    };
    start(async () => {
      const r = await saveInvoiceAction(orgSlug, input, which);
      if (r.ok) router.push(`/${orgSlug}/invoices/${r.id}?saved=${which}`);
      else setError(r.error);
    });
  };

  const f = (k: string) => `${ids}-${k}`;
  const body = (
    <div className="flex flex-col gap-4">
      {draft && <AiDraftBanner confidence={draft.confidence} linesSen={net + tax} printedTotalSen={draft.printedTotal ? toSen(draft.printedTotal) : null} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
        <div data-flow="invoice-customer" className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor={f("customer")} className="text-[13px] font-medium text-ink-2">
            {t("invoices.form.customer")}
            <span className="ml-0.5 text-negative" aria-hidden="true">
              *
            </span>
          </label>
          <Input id={f("customer")} list={f("customers")} autoComplete="off" placeholder={t("invoices.form.customerPlaceholder")} value={customer} onChange={(e) => pickCustomer(e.target.value)} />
          <datalist id={f("customers")}>
            {customers.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
          <p className="text-[13px] text-muted">{customer.trim() && !match ? t("invoices.form.createCustomer", { query: customer.trim() }) : t("invoices.form.customerHint")}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={f("number")} className="text-[13px] font-medium text-ink-2">
            {t("invoices.form.invoiceNumber")}
          </label>
          <Input id={f("number")} readOnly={!ownNumber} placeholder="Assigned when saved" value={ownNumber ? number : (initial.invoiceNumber ?? suggestedNumber)} onChange={(e) => setNumber(e.target.value)} className={ownNumber ? undefined : "bg-surface-2"} />
          {!ownNumber && (
            <p className="text-[13px] text-muted">
              {editing ? t("invoices.form.issuedKeepsNumber") : "Assigned when saved."}{" "}
              {!editing && (
                <button type="button" className="text-ink underline underline-offset-2" onClick={() => setOwnNumber(true)}>
                  Use my own number
                </button>
              )}
            </p>
          )}
        </div>
        <FormField label={t("invoices.form.currency")} htmlFor={f("currency")}>
          <Select defaultValue="MYR" disabled>
            <option value="MYR">MYR</option>
          </Select>
        </FormField>
        <FormField label={t("invoices.form.invoiceDate")} htmlFor={f("date")} required>
          <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </FormField>
        <div className="flex flex-col gap-1.5">
          <FormField label={t("invoices.form.dueDate")} htmlFor={f("due")} hint={t("invoices.form.dueHint")}>
            <Input type="date" min={date || undefined} value={due} onChange={(e) => setDue(e.target.value)} />
          </FormField>
          <div className="flex gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => setDue("")}>
              {t("invoices.form.clear")}
            </Button>
            {([30, 60, 90] as const).map((d) => (
              <Button key={d} variant="secondary" size="sm" disabled={!date} onClick={() => setDue(addDays(date, d))}>
                {t(`invoices.form.days.${d}`)}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div data-flow="invoice-lines" className="flex flex-col gap-6 md:gap-2">
        <span className="text-[13px] font-medium text-ink-2">{t("invoices.form.lines")}</span>
        <div data-flow="pricing-mode" className="flex flex-col gap-1">
          <fieldset className="flex flex-wrap items-center gap-3 text-[13px]">
            <legend className="mr-2 inline font-medium text-ink-2">{t("shared.pricingMode.label")}</legend>
            {(["exclusive", "inclusive"] as const).map((m) => (
              <label key={m} className="flex min-h-11 cursor-pointer items-center gap-1.5 text-ink">
                <input type="radio" name={f("pricing")} checked={mode === m} onChange={() => setMode(m)} />
                {t(`shared.pricingMode.${m}`)}
              </label>
            ))}
          </fieldset>
        </div>
        <div aria-hidden="true" className={COL_HEAD}>
          <span className="md:col-span-3">{t("invoices.form.description")}</span>
          <span className="md:col-span-3">{t("invoices.form.revenueAccount")}</span>
          <span className="md:col-span-1">{t("invoices.form.qty")}</span>
          <span className="text-right md:col-span-2">{mode === "inclusive" ? `${t("invoices.form.unitPrice")} (${t("shared.pricingMode.lineLabelInclusive")})` : t("invoices.form.unitPrice")}</span>
          <span className="text-right md:col-span-2">{t("invoices.form.discountPercent")}</span>
          <span className="text-right md:col-span-2">{t("invoices.form.discountIn", { unit: "RM" })}</span>
          <span className="text-right md:col-span-2">{t("invoices.form.newPrice")}</span>
          <span className="md:col-span-2">{t("invoices.form.tax")}</span>
          <span className="md:col-span-1" />
        </div>
        {lines.map((l, i) => {
          const price = toSen(l.unitPrice);
          return (
            <div key={l.key} className="grid grid-cols-1 gap-2 md:grid-cols-[repeat(18,minmax(0,1fr))] md:items-start">
              <div className="md:col-span-3">
                <span aria-hidden="true" className={MOBILE_LABEL}>
                  {t("invoices.form.description")}
                </span>
                <Input aria-label={t("invoices.form.aria.description", { n: i + 1 })} placeholder={t("invoices.form.description")} value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} />
              </div>
              <div className="md:col-span-3">
                <AccountCombobox accounts={revenue} value={l.accountCode} onChange={(code) => update(l.key, { accountCode: code })} placeholder={t("invoices.form.accountPlaceholder")} ariaLabel={`Line ${i + 1} account`} />
              </div>
              <div className="md:col-span-1">
                <span aria-hidden="true" className={MOBILE_LABEL}>
                  {t("invoices.form.quantity")}
                </span>
                <Input aria-label={t("invoices.form.aria.quantity", { n: i + 1 })} placeholder="1" inputMode="decimal" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <span aria-hidden="true" className={MOBILE_LABEL}>
                  {t("invoices.form.unitPrice")}
                </span>
                <Input
                  aria-label={t("invoices.form.aria.unitPrice", { n: i + 1 })}
                  placeholder="0.00"
                  inputMode="decimal"
                  className="num text-right"
                  value={l.unitPrice}
                  onChange={(e) => {
                    const v = e.target.value;
                    const p = toSen(v);
                    // Keep the chosen discount and recompute the other two fields from the new price.
                    if (l.discountMode === "percent" && p !== null && Number(l.discountPercent) > 0) {
                      const d = discountByPercent(p, Number(l.discountPercent));
                      update(l.key, { unitPrice: v, discountedUnitPrice: fromSen(d).replace(/,/g, ""), discountAmount: fromSen(p - d).replace(/,/g, "") });
                    } else update(l.key, { unitPrice: v });
                  }}
                />
              </div>
              <div className="md:col-span-2">
                <span aria-hidden="true" className={MOBILE_LABEL}>
                  {t("invoices.form.discountPercent")}
                </span>
                <Input
                  aria-label={t("invoices.form.aria.discountPercent", { n: i + 1 })}
                  placeholder="0"
                  inputMode="decimal"
                  className="num text-right"
                  value={l.discountPercent}
                  onChange={(e) => {
                    const v = e.target.value;
                    const pct = Number(v);
                    const d = v.trim() && price !== null && pct > 0 && pct < 100 ? discountByPercent(price, pct) : null;
                    update(l.key, {
                      discountPercent: v,
                      discountMode: v.trim() ? "percent" : "",
                      discountedUnitPrice: d === null ? "" : fromSen(d).replace(/,/g, ""),
                      discountAmount: d === null || price === null ? "" : fromSen(price - d).replace(/,/g, ""),
                    });
                  }}
                />
              </div>
              <div className="md:col-span-2">
                <span aria-hidden="true" className={MOBILE_LABEL}>
                  {t("invoices.form.discountIn", { unit: "RM" })}
                </span>
                <Input
                  aria-label={t("invoices.form.aria.discountAmount", { n: i + 1 })}
                  placeholder="0.00"
                  inputMode="decimal"
                  className="num text-right"
                  value={l.discountAmount}
                  onChange={(e) => {
                    const v = e.target.value;
                    const off = toSen(v);
                    const d = v.trim() && price !== null && off !== null && off <= price ? price - off : null;
                    update(l.key, {
                      discountAmount: v,
                      discountMode: v.trim() ? "amount" : "",
                      discountedUnitPrice: d === null ? "" : fromSen(d).replace(/,/g, ""),
                      discountPercent: d === null || price === null ? "" : percentOf(price, d),
                    });
                  }}
                />
              </div>
              <div className="md:col-span-2">
                <span aria-hidden="true" className={MOBILE_LABEL}>
                  {t("invoices.form.newPrice")}
                </span>
                <Input
                  aria-label={t("invoices.form.aria.discountedPrice", { n: i + 1 })}
                  placeholder="0.00"
                  inputMode="decimal"
                  className="num text-right"
                  value={l.discountedUnitPrice}
                  onChange={(e) => {
                    const v = e.target.value;
                    const d = toSen(v);
                    const ok = v.trim() && price !== null && d !== null && d <= price;
                    update(l.key, {
                      discountedUnitPrice: v,
                      discountMode: v.trim() ? "price" : "",
                      discountPercent: ok ? percentOf(price!, d!) : "",
                      discountAmount: ok ? fromSen(price! - d!).replace(/,/g, "") : "",
                    });
                  }}
                />
              </div>
              <div className="md:col-span-2">
                <span aria-hidden="true" className={MOBILE_LABEL}>
                  {t("invoices.form.tax")}
                </span>
                <Select aria-label={t("invoices.form.aria.tax", { n: i + 1 })} value={l.taxCode} onChange={(e) => update(l.key, { taxCode: e.target.value })}>
                  {TAX_CODES.map((c) => (
                    <option key={c} value={c}>
                      {t(`invoices.form.tax.${c}`)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="md:col-span-1">
                <Button variant="ghost" size="sm" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                  {t("invoices.form.remove")}
                </Button>
              </div>
              <div className="md:col-span-full">
                <Select aria-label={t("invoices.form.aria.classification", { n: i + 1 })} value={l.classificationCode} onChange={(e) => update(l.key, { classificationCode: e.target.value })}>
                  <option value="">{t("invoices.form.classificationDefault")}</option>
                  {CLASSIFICATION_CODES.map(([code, label]) => (
                    <option key={code} value={code}>
                      {code} · {label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          );
        })}
        <div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setLines((ls) => [...ls, { ...blankLine(defaultRevenue), key: seq }]);
              setSeq((s) => s + 1);
            }}
          >
            {t("invoices.form.addLine")}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1 rounded border border-border bg-surface-2 px-3 py-2 text-[13px]">
        <div className="flex flex-wrap justify-end gap-6">
          <span className="text-muted">
            {mode === "inclusive" ? t("shared.pricingMode.totalExcludingTax") : t("invoices.form.subtotal")}: <span className="num text-ink">RM{fromSen(net)}</span>
          </span>
          {tax > 0 && (
            <span className="text-muted">
              {mode === "inclusive" ? t("shared.pricingMode.includedTax") : "SST"}: <span className="num text-ink">RM{fromSen(tax)}</span>
            </span>
          )}
          <span className="text-muted">
            {t("invoices.form.total")}: <span className="num font-semibold text-ink">RM{fromSen(net + tax)}</span>
          </span>
        </div>
      </div>

      <FormField label={t("invoices.form.notes")} htmlFor={f("notes")}>
        <Input placeholder={t("invoices.form.optional")} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </FormField>

      {gaps.length > 0 && (
        <div role="alert" className="rounded-[10px] border border-warning/40 bg-warning-soft px-3 py-2 text-[13px] text-ink-2">
          <p className="m-0 font-medium">{t("invoices.form.gapsTitle")}</p>
          <ul className="m-0 mt-1 list-disc pl-5">
            {gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </div>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-negative">
          {error}
        </p>
      )}
      <div data-flow="invoice-actions" className="flex items-center justify-end gap-2">
        <Button variant="secondary" disabled={pending} onClick={() => submit("draft")}>
          {pending && intent === "draft" ? t("invoices.form.saving") : editing ? t("invoices.form.saveChanges") : t("invoices.form.saveDraft")}
        </Button>
        <Button variant="primary" disabled={pending} onClick={() => submit("record")}>
          {pending && intent === "record" ? t("invoices.form.recording") : t("invoices.form.saveAndRecord")}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="rounded-lg border border-border bg-surface p-4 outline-none">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[13.5px] font-semibold text-ink">{title ?? t("invoices.new.title")}</h2>
        <Link href={closeHref} className={buttonClass("ghost", "sm")}>
          <X size={13} aria-hidden="true" />
          {t("invoices.form.cancel")}
        </Link>
      </div>
      {draft?.source ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {body}
          <aside className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink-2">{t("invoices.detail.sourceDocument")}</span>
            <div className="md:sticky md:top-4">
              <SourceDocument source={draft.source} label={t("invoices.detail.sourceDocument")} />
            </div>
          </aside>
        </div>
      ) : (
        body
      )}
    </div>
  );
}
