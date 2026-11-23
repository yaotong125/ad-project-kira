"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition, type ReactNode } from "react";
import { it } from "@/features/inbox/limits";
import { DEFAULT_LINE_ACCOUNT, type Proposal } from "@/features/inbox/proposal";
import { AccountCombobox } from "@/features/books/account-combobox";
import { AiDraftBanner } from "@/features/books/ai-draft-banner";
import type { AccountOption, SourcePreview } from "@/features/books/load";
import { fromSen, lineSen, toQuantity, toSen } from "@/features/books/money";
import { SourceDocument } from "@/features/books/source-preview";
import type { Lang } from "@/shared/i18n";
import { Button, buttonClass } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";
import { FormField, Input, Select } from "@/shared/ui/form-controls";
import { recordBillAction } from "./actions";

type Line = { key: number; description: string; accountCode: string; quantity: string; unitPrice: string; taxCode: string };

const TAX_CODES = ["none", "sst_6", "sst_8", "sales_5", "sales_10"] as const;

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * lejar.ai's "Record a bill" form (BillForm, chunk 2kg86gwcu_pjp), with Kira's scope for the AI Inbox
 * slice: MYR only, "Save & record" only (drafts, stock, instalments, withholding tax and foreign
 * currency come with the Bills slice). Pre-filled from an AI draft when opened with ?aiDraft=.
 */
export function BillForm({
  orgSlug,
  lang,
  accounts,
  suppliers,
  suggestedNumber,
  today,
  draft,
  closeHref,
  defaultPayable,
}: {
  orgSlug: string;
  lang: Lang;
  accounts: AccountOption[];
  suppliers: { id: string; name: string }[];
  suggestedNumber: string;
  today: string;
  draft: { id: string; confidence: number | null; proposal: Proposal; sourceDocumentId: string; source: SourcePreview | null } | null;
  closeHref: string;
  /** The AP control account's code (Settings → Accounting). */
  defaultPayable: string | null;
}) {
  const t = (k: Parameters<typeof it>[1], v?: Record<string, string | number>) => it(lang, k, v);
  const router = useRouter();
  const ids = useId();
  const p = draft?.proposal;
  const lineAccounts = useMemo(() => accounts.filter((a) => !a.isCash && a.type !== "equity"), [accounts]);
  const payables = useMemo(() => accounts.filter((a) => a.type === "liability"), [accounts]);
  const defaultLine = accounts.some((a) => a.code === DEFAULT_LINE_ACCOUNT) ? DEFAULT_LINE_ACCOUNT : (lineAccounts[0]?.code ?? "");

  const [supplier, setSupplier] = useState(p?.counterparty?.name ?? "");
  const [ownNumber, setOwnNumber] = useState(Boolean(p?.documentNumber));
  const [billNumber, setBillNumber] = useState(p?.documentNumber ?? "");
  const [billDate, setBillDate] = useState(p?.documentDate ?? today);
  const [dueDate, setDueDate] = useState(p?.dueDate ?? "");
  const [payable, setPayable] = useState(defaultPayable && payables.some((a) => a.code === defaultPayable) ? defaultPayable : (payables[0]?.code ?? ""));
  const [notes, setNotes] = useState("");
  const [seq, setSeq] = useState(p?.lines.length ?? 1);
  const [lines, setLines] = useState<Line[]>(
    p && p.lines.length > 0
      ? p.lines.map((l, i) => ({ key: i, description: l.description, accountCode: l.accountCode, quantity: l.quantity, unitPrice: l.unitPrice, taxCode: TAX_CODES.includes(l.taxCode as never) ? l.taxCode : "none" }))
      : [{ key: 0, description: "", accountCode: defaultLine, quantity: "1", unitPrice: "", taxCode: "none" }],
  );
  const [gaps, setGaps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const supplierMatch = suppliers.find((s) => s.name.toLowerCase() === supplier.trim().toLowerCase());
  const totals = lines.reduce(
    (acc, l) => {
      const q = toQuantity(l.quantity);
      const price = toSen(l.unitPrice);
      if (q === null || price === null) return acc;
      const { net, tax } = lineSen(q, price, l.taxCode);
      return { sub: acc.sub + net, tax: acc.tax + tax };
    },
    { sub: 0, tax: 0 },
  );
  const printedTotal = p ? toSen(p.total) : null;
  const foreign = p && p.currency !== "MYR" ? p.currency : null;

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const submit = () => {
    const missing: string[] = [];
    if (!supplier.trim()) missing.push(t("bills.form.gap.supplier"));
    if (!billDate) missing.push(t("bills.form.gap.date"));
    if (ownNumber && !billNumber.trim()) missing.push(t("bills.form.gap.number"));
    if (dueDate && billDate && dueDate < billDate) missing.push(t("bills.form.gap.dueBeforeDate"));
    if (!payable) missing.push(t("bills.form.gap.payable"));
    if (lines.some((l) => toQuantity(l.quantity) === null || toSen(l.unitPrice) === null || l.unitPrice.trim() === "" || !l.accountCode) || totals.sub + totals.tax <= 0) {
      missing.push(t("bills.form.gap.lineAmounts"));
    }
    setGaps(missing);
    setError(null);
    if (missing.length > 0) return;
    start(async () => {
      const r = await recordBillAction({
        orgSlug,
        supplierContactId: supplierMatch?.id ?? null,
        supplierName: supplier.trim(),
        supplierTin: supplierMatch ? null : (p?.counterparty?.tin ?? null),
        billNumber: ownNumber ? billNumber.trim() : null,
        billDate,
        dueDate: dueDate || null,
        payableAccountCode: payable,
        notes,
        aiDraftId: draft?.id ?? null,
        sourceDocumentId: draft?.sourceDocumentId ?? null,
        lines: lines.map((l) => ({
          description: l.description.trim(),
          accountCode: l.accountCode,
          quantity: String(toQuantity(l.quantity)),
          unitPrice: ((toSen(l.unitPrice) ?? 0) / 100).toFixed(2),
          taxCode: l.taxCode,
        })),
      });
      if (r.ok) router.push(`/${orgSlug}/bills?saved=${encodeURIComponent(r.number)}`);
      else setError(r.error);
    });
  };

  const field = (id: string) => `${ids}-${id}`;
  const fields: ReactNode = (
    <div className="flex flex-col gap-4">
      {draft && <AiDraftBanner confidence={draft.confidence} linesSen={totals.sub + totals.tax} printedTotalSen={printedTotal} />}
      {foreign && (
        <p role="status" className="rounded border border-warning/40 bg-warning-soft px-3 py-2 text-[12.5px] text-ink-2">
          This document is in {foreign}. Kira records bills in MYR for now: enter the ringgit amounts before you record it.
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor={field("supplier")} className="text-[13px] font-medium text-ink-2">
            {t("bills.form.supplier")}
          </label>
          <Input
            id={field("supplier")}
            list={field("suppliers")}
            autoComplete="off"
            placeholder={t("bills.form.supplierPlaceholder")}
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            aria-describedby={field("supplier-message")}
          />
          <datalist id={field("suppliers")}>
            {suppliers.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
          <p id={field("supplier-message")} className="text-[13px] text-muted">
            {supplier.trim() && !supplierMatch ? t("bills.form.createSupplier", { query: supplier.trim() }) : t("bills.form.supplierHint")}
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={field("number")} className="text-[13px] font-medium text-ink-2">
            {t("bills.form.billNumber")}
          </label>
          <Input
            id={field("number")}
            readOnly={!ownNumber}
            placeholder="Assigned when saved"
            value={ownNumber ? billNumber : suggestedNumber}
            onChange={(e) => setBillNumber(e.target.value)}
            className={ownNumber ? undefined : "bg-surface-2"}
          />
          <p className="text-[13px] text-muted">
            {ownNumber ? (
              <button type="button" className="text-ink underline underline-offset-2" onClick={() => setOwnNumber(false)}>
                Number it for me
              </button>
            ) : (
              <>
                Assigned when saved.{" "}
                <button type="button" className="text-ink underline underline-offset-2" onClick={() => setOwnNumber(true)}>
                  Use my own number
                </button>
              </>
            )}
          </p>
        </div>
        <FormField label={t("bills.form.currency")} htmlFor={field("currency")}>
          <Select defaultValue="MYR" disabled>
            <option value="MYR">MYR</option>
          </Select>
        </FormField>
        <FormField label={t("bills.form.billDate")} htmlFor={field("date")} required>
          <Input type="date" required value={billDate} onChange={(e) => setBillDate(e.target.value)} />
        </FormField>
        <div className="flex flex-col gap-1.5">
          <FormField label={t("bills.form.dueDate")} htmlFor={field("due")} hint={t("bills.form.dueHint")}>
            <Input type="date" min={billDate || undefined} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </FormField>
          <div className="flex gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => setDueDate("")}>
              {t("bills.form.clear")}
            </Button>
            {([30, 60, 90] as const).map((d) => (
              <Button key={d} variant="secondary" size="sm" disabled={!billDate} onClick={() => setDueDate(addDays(billDate, d))}>
                {t(`bills.form.days.${d}`)}
              </Button>
            ))}
          </div>
        </div>
        <details className="group sm:col-span-2 [&>summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-md border border-border bg-surface-2/50 px-3 py-2 text-[12.5px] transition-colors hover:bg-surface-2 group-open:border-transparent group-open:bg-transparent group-open:px-0 group-open:py-0">
            <span className="text-muted group-open:hidden">
              {t("bills.form.payableSummary")}{" "}
              <span className="font-medium text-ink-2">{payables.find((a) => a.code === payable) ? `${payable} · ${payables.find((a) => a.code === payable)?.name}` : "-"}</span>
            </span>
            <span className="ml-auto font-medium text-ink-2 group-open:hidden">{t("bills.form.change")}</span>
            <span className="ml-auto hidden font-medium text-ink-2 group-open:inline">{t("bills.form.close")}</span>
          </summary>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={field("payable")} className="text-[13px] font-medium text-ink-2">
              {t("bills.form.payableAccount")}
            </label>
            <AccountCombobox id={field("payable")} accounts={payables} value={payable} onChange={setPayable} placeholder={t("bills.form.payablePlaceholder")} />
            <p className="text-[13px] text-muted">Where this bill&apos;s payable side posts.</p>
          </div>
        </details>
      </div>

      <div className="flex flex-col gap-6 md:gap-2">
        <span className="text-[13px] font-medium text-ink-2">{t("bills.form.lines")}</span>
        {lines.map((l, i) => (
          <div key={l.key} className="grid grid-cols-1 gap-2 md:grid-cols-12 md:items-end">
            <div className="md:col-span-3">
              <Input aria-label={t("bills.form.aria.description", { n: i + 1 })} placeholder={t("bills.form.description")} value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} />
            </div>
            <div className="md:col-span-3">
              <AccountCombobox
                ariaLabel={t("bills.form.aria.account", { n: i + 1 })}
                accounts={lineAccounts}
                value={l.accountCode}
                onChange={(code) => update(l.key, { accountCode: code })}
                placeholder={t("bills.form.accountPlaceholder")}
              />
            </div>
            <div className="md:col-span-1">
              <Input aria-label={t("bills.form.aria.quantity", { n: i + 1 })} placeholder="1" inputMode="decimal" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Input aria-label={t("bills.form.aria.unitPrice", { n: i + 1 })} placeholder="0.00" inputMode="decimal" className="text-right" value={l.unitPrice} onChange={(e) => update(l.key, { unitPrice: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Select aria-label={t("bills.form.aria.tax", { n: i + 1 })} value={l.taxCode} onChange={(e) => update(l.key, { taxCode: e.target.value })}>
                {TAX_CODES.map((c) => (
                  <option key={c} value={c}>
                    {t(`bills.form.tax.${c}`)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="md:col-span-1">
              <Button variant="ghost" size="sm" aria-label={t("bills.form.aria.remove", { n: i + 1 })} disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                {t("bills.form.remove")}
              </Button>
            </div>
          </div>
        ))}
        <div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setLines((ls) => [...ls, { key: seq, description: "", accountCode: defaultLine, quantity: "1", unitPrice: "", taxCode: "none" }]);
              setSeq((s) => s + 1);
            }}
          >
            {t("bills.form.addLine")}
          </Button>
        </div>
        <div className="flex flex-col items-end gap-1 text-[12.5px] text-muted">
          <p className="m-0">
            {t("bills.form.subtotal")} <span className="num text-ink-2">{fromSen(totals.sub)}</span>
          </p>
          <p className="m-0">
            {t("bills.form.sst")} <span className="num text-ink-2">{fromSen(totals.tax)}</span>
          </p>
          <p className="m-0 text-[13px] font-medium text-ink">
            {t("bills.form.total")} <span className="num">RM{fromSen(totals.sub + totals.tax)}</span>
          </p>
        </div>
      </div>

      <FormField label={t("bills.form.notes")} htmlFor={field("notes")}>
        <Input placeholder={t("bills.form.optional")} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </FormField>

      {gaps.length > 0 && (
        <div role="alert" className="rounded-[10px] border border-warning/40 bg-warning-soft px-3 py-2 text-[13px] text-ink-2">
          <p className="m-0 font-medium">{t("bills.form.gapsTitle")}</p>
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
      <div className="flex items-center justify-end gap-2">
        <Link href={closeHref} className={buttonClass("ghost")}>
          {t("bills.form.cancel")}
        </Link>
        <Button variant="primary" disabled={pending} onClick={submit}>
          {pending ? t("bills.form.recording") : t("bills.form.saveAndRecord")}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="rounded-lg border border-border bg-surface p-4 outline-none">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[13.5px] font-semibold text-ink">Record a bill</h2>
        <Link href={closeHref} className={buttonClass("ghost", "sm")}>
          <X size={13} aria-hidden="true" />
          {t("bills.form.close")}
        </Link>
      </div>
      {draft?.source ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {fields}
          <aside className={cn("flex flex-col gap-1.5")}>
            <span className="text-[13px] font-medium text-ink-2">{t("bills.form.sourceDocument")}</span>
            <div className="md:sticky md:top-4">
              <SourceDocument source={draft.source} label={t("bills.form.sourceDocument")} />
            </div>
          </aside>
        </div>
      ) : (
        fields
      )}
    </div>
  );
}
