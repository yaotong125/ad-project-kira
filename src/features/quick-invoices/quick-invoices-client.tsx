"use client";

import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { rm } from "@/features/books/money";
import { Button, buttonClass } from "@/shared/ui/button";
import { Input, Select } from "@/shared/ui/form-controls";
import {
  deleteQuickInvoiceDraftAction,
  markQuickInvoiceSentAction,
  saveQuickInvoiceAction,
} from "./actions";
import {
  QUICK_TAX_OPTIONS,
  computeQuickLine,
  type CustomerChoice,
  type DiscountMode,
  type QuickInvoiceFormInput,
  type QuickInvoiceLineInput,
  type QuickInvoiceProfileSnapshot,
  type QuickTaxCode,
  type RevenueAccountChoice,
} from "./types";

const EMPTY_LINE: QuickInvoiceLineInput = {
  description: "",
  quantity: "1",
  unitPrice: "",
  discountMode: "",
  discountPercent: "",
  discountAmount: "",
  discountedUnitPrice: "",
  taxCode: "none",
};

export function QuickInvoiceForm({
  orgSlug,
  initial,
  customers,
  revenueAccounts,
  profile,
  isEdit,
}: {
  orgSlug: string;
  initial: QuickInvoiceFormInput;
  customers: CustomerChoice[];
  revenueAccounts: RevenueAccountChoice[];
  profile: QuickInvoiceProfileSnapshot;
  isEdit: boolean;
}) {
  const router = useRouter();
  const base = `/${orgSlug}`;
  const [customerName, setCustomerName] = useState(initial.customerName);
  const [customerEmail, setCustomerEmail] = useState(initial.customerEmail);
  const [saveCustomer, setSaveCustomer] = useState(initial.saveCustomer);
  const [invoiceNumber, setInvoiceNumber] = useState(initial.invoiceNumber);
  const [invoiceDate, setInvoiceDate] = useState(initial.invoiceDate);
  const [dueDate, setDueDate] = useState(initial.dueDate);
  const [pricingMode, setPricingMode] = useState<"exclusive" | "inclusive">(initial.pricingMode);
  const [incomeAccountCode, setIncomeAccountCode] = useState(initial.incomeAccountCode);
  const [notes, setNotes] = useState(initial.notes);
  const [lines, setLines] = useState<QuickInvoiceLineInput[]>(
    initial.lines.length > 0 ? initial.lines : [{ ...EMPTY_LINE }],
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const matchedCustomer = useMemo(() => {
    const q = customerName.trim().toLowerCase();
    if (!q) return null;
    return customers.find((c) => c.name.toLowerCase() === q) ?? null;
  }, [customerName, customers]);

  const totals = useMemo(() => {
    let sub = 0;
    let tax = 0;
    let tot = 0;
    for (const l of lines) {
      const c = computeQuickLine(l, pricingMode);
      sub += c.netSen;
      tax += c.taxSen;
      tot += c.totalSen;
    }
    return { sub, tax, tot };
  }, [lines, pricingMode]);

  const updateLine = (i: number, patch: Partial<QuickInvoiceLineInput>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px] lg:items-start">
      <form
        className="flex flex-col gap-5 rounded-[var(--radius-lg)] border border-border bg-surface p-5"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const r = await saveQuickInvoiceAction(orgSlug, {
              id: initial.id,
              customerContactId: matchedCustomer?.id ?? null,
              customerName: customerName.trim(),
              customerEmail: customerEmail.trim(),
              saveCustomer: !matchedCustomer && saveCustomer,
              invoiceNumber: invoiceNumber.trim(),
              invoiceDate,
              dueDate,
              pricingMode,
              incomeAccountCode,
              notes,
              lines,
            });
            if (r.ok) {
              router.push(`${base}/quick-invoices/${r.id}`);
              router.refresh();
            } else {
              setError(r.error);
            }
          });
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="qi-customer" className="text-[12.5px] font-medium text-ink-2">
              Customer<span className="ml-0.5 text-negative" aria-hidden="true">*</span>
            </label>
            <Input
              id="qi-customer"
              list="qi-customers-list"
              required
              placeholder="Search or add a customer..."
              value={customerName}
              onChange={(e) => {
                const v = e.target.value;
                setCustomerName(v);
                const hit = customers.find((c) => c.name.toLowerCase() === v.trim().toLowerCase());
                if (hit?.email && !customerEmail) setCustomerEmail(hit.email);
              }}
            />
            <datalist id="qi-customers-list">
              {customers.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
            {customerName.trim() && !matchedCustomer ? (
              <label className="mt-0.5 inline-flex w-fit cursor-pointer items-center gap-1.5 text-[12px] text-ink-2">
                <input
                  type="checkbox"
                  className="accent-brand"
                  checked={saveCustomer}
                  onChange={(e) => setSaveCustomer(e.target.checked)}
                />
                Save “{customerName.trim()}” as a new customer
              </label>
            ) : (
              <span className="text-[11.5px] text-muted">Type a name to add a new customer.</span>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="qi-email" className="text-[12.5px] font-medium text-ink-2">
              Customer email
            </label>
            <Input
              id="qi-email"
              type="email"
              placeholder="billing@customer.com.my"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
            />
            <span className="text-[11.5px] text-muted">Optional. Printed on the PDF for your customer.</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="qi-number" className="text-[12.5px] font-medium text-ink-2">
              Invoice number
            </label>
            <Input
              id="qi-number"
              placeholder="Auto (e.g. QI-202611-001)"
              value={invoiceNumber}
              disabled={isEdit}
              onChange={(e) => setInvoiceNumber(e.target.value)}
            />
            {isEdit && <span className="text-[11.5px] text-muted">Set when the draft was created.</span>}
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="qi-date" className="text-[12.5px] font-medium text-ink-2">
              Invoice date<span className="ml-0.5 text-negative" aria-hidden="true">*</span>
            </label>
            <Input id="qi-date" type="date" required value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="qi-due" className="text-[12.5px] font-medium text-ink-2">
              Due date (optional)
            </label>
            <Input id="qi-due" type="date" min={invoiceDate} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="qi-income" className="text-[12.5px] font-medium text-ink-2">
              Income account
            </label>
            <Select id="qi-income" value={incomeAccountCode} onChange={(e) => setIncomeAccountCode(e.target.value)}>
              {revenueAccounts.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} · {a.name}
                </option>
              ))}
            </Select>
            <span className="text-[11.5px] text-muted">
              Typed lines go to this account when added to your books. Saved for the company.
            </span>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="qi-pricing" className="text-[12.5px] font-medium text-ink-2">
              SST pricing
            </label>
            <Select
              id="qi-pricing"
              value={pricingMode}
              onChange={(e) => setPricingMode(e.target.value as "exclusive" | "inclusive")}
            >
              <option value="exclusive">Exclude SST (tax added on top)</option>
              <option value="inclusive">Include SST (tax included in price)</option>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <h2 className="m-0 text-[13.5px] font-semibold text-ink">Line items</h2>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setLines((prev) => [...prev, { ...EMPTY_LINE }])}
            >
              <Plus size={13} aria-hidden="true" /> Add line
            </Button>
          </div>

          <div className="flex flex-col gap-3">
            {lines.map((l, i) => {
              const calc = computeQuickLine(l, pricingMode);
              return (
                <div key={i} className="rounded-[var(--radius)] border border-border bg-surface-2/40 p-3">
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[1fr_80px_110px_140px_auto] sm:items-end">
                    <div className="flex min-w-0 flex-col gap-1">
                      <label className="text-[11.5px] font-medium text-muted">Description</label>
                      <Input
                        aria-label={`Line ${i + 1} description`}
                        required
                        placeholder="What are you billing for?"
                        value={l.description}
                        onChange={(e) => updateLine(i, { description: e.target.value })}
                      />
                    </div>
                    <div className="flex min-w-0 flex-col gap-1">
                      <label className="text-[11.5px] font-medium text-muted">Qty</label>
                      <Input
                        aria-label={`Line ${i + 1} quantity`}
                        type="number"
                        step="any"
                        min="0.0001"
                        required
                        value={l.quantity}
                        onChange={(e) => updateLine(i, { quantity: e.target.value })}
                      />
                    </div>
                    <div className="flex min-w-0 flex-col gap-1">
                      <label className="text-[11.5px] font-medium text-muted">Unit price</label>
                      <Input
                        aria-label={`Line ${i + 1} unit price`}
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        placeholder="0.00"
                        value={l.unitPrice}
                        onChange={(e) => updateLine(i, { unitPrice: e.target.value })}
                      />
                    </div>
                    <div className="flex min-w-0 flex-col gap-1">
                      <label className="text-[11.5px] font-medium text-muted">SST</label>
                      <Select
                        aria-label={`Line ${i + 1} SST`}
                        value={l.taxCode}
                        onChange={(e) => updateLine(i, { taxCode: e.target.value as QuickTaxCode })}
                      >
                        {QUICK_TAX_OPTIONS.map((t) => (
                          <option key={t.code} value={t.code}>
                            {t.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <span className="num-sans text-[13px] font-medium text-ink">{rm(calc.totalSen)}</span>
                      {lines.length > 1 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={`Remove line ${i + 1}`}
                          onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                        >
                          <Trash2 size={13} aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
                    <div className="w-[150px]">
                      <Select
                        aria-label={`Line ${i + 1} discount mode`}
                        className="h-[28px] text-[12px]"
                        value={l.discountMode}
                        onChange={(e) =>
                          updateLine(i, {
                            discountMode: e.target.value as DiscountMode,
                            discountPercent: "",
                            discountAmount: "",
                            discountedUnitPrice: "",
                          })
                        }
                      >
                        <option value="">No discount</option>
                        <option value="percent">Discount %</option>
                        <option value="amount">Discount RM</option>
                        <option value="price">New price</option>
                      </Select>
                    </div>
                    {l.discountMode === "percent" && (
                      <div className="w-[105px]">
                        <Input
                          aria-label={`Line ${i + 1} discount percent`}
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          placeholder="e.g. 10"
                          className="h-[28px] text-[12px]"
                          value={l.discountPercent}
                          onChange={(e) => updateLine(i, { discountPercent: e.target.value })}
                        />
                      </div>
                    )}
                    {l.discountMode === "amount" && (
                      <div className="w-[105px]">
                        <Input
                          aria-label={`Line ${i + 1} discount amount`}
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="RM off"
                          className="h-[28px] text-[12px]"
                          value={l.discountAmount}
                          onChange={(e) => updateLine(i, { discountAmount: e.target.value })}
                        />
                      </div>
                    )}
                    {l.discountMode === "price" && (
                      <div className="w-[120px]">
                        <Input
                          aria-label={`Line ${i + 1} discounted price`}
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="New unit RM"
                          className="h-[28px] text-[12px]"
                          value={l.discountedUnitPrice}
                          onChange={(e) => updateLine(i, { discountedUnitPrice: e.target.value })}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="qi-notes" className="text-[12.5px] font-medium text-ink-2">
            Notes (optional)
          </label>
          <textarea
            id="qi-notes"
            rows={2}
            maxLength={1000}
            placeholder="Payment terms, reference, thank-you note"
            className="w-full rounded-[var(--radius)] border border-border-strong bg-surface px-3 py-2 text-[13px] text-ink outline-none placeholder:text-muted focus:border-ink"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1 border-t border-border pt-3 text-[13px]" data-testid="qi-totals">
          <div className="flex justify-between text-muted">
            <span>Subtotal before SST</span>
            <span className="num-sans text-ink">{rm(totals.sub)}</span>
          </div>
          <div className="flex justify-between text-muted">
            <span>SST</span>
            <span className="num-sans text-ink">{rm(totals.tax)}</span>
          </div>
          <div className="flex justify-between pt-1 text-[14.5px] font-semibold text-ink">
            <span>Total after SST</span>
            <span className="num-sans">{rm(totals.tot)}</span>
          </div>
        </div>

        {error && (
          <p role="alert" className="m-0 text-[12.5px] text-negative">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link href={isEdit && initial.id ? `${base}/quick-invoices/${initial.id}` : `${base}/quick-invoices`} className={buttonClass("ghost", "sm")}>
            Cancel
          </Link>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving..." : isEdit ? "Save changes" : "Save draft"}
          </Button>
        </div>
      </form>

      <aside className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="m-0 text-[14px] font-semibold text-ink">What appears on the PDF</h2>
          <Link href={`${base}/settings/profile`} className="text-[12px] font-medium text-brand hover:underline">
            Change in Settings
          </Link>
        </div>
        <p className="m-0 text-[12px] text-muted">Read-only here. Comes from your organisation profile.</p>
        <dl className="m-0 flex flex-col gap-2.5 text-[12.5px]">
          <div>
            <dt className="text-[11px] uppercase tracking-[0.05em] text-muted">Legal name</dt>
            <dd className="m-0 mt-0.5 text-ink">{profile.legalName || "–"}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-[0.05em] text-muted">SSM number</dt>
            <dd className="num m-0 mt-0.5 text-ink">{profile.ssmNumber ?? "Not set"}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-[0.05em] text-muted">Address</dt>
            <dd className="m-0 mt-0.5 text-ink-2">{profile.address ?? "Not set"}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-[0.05em] text-muted">Payment note</dt>
            <dd className="m-0 mt-0.5 text-ink-2">{profile.paymentNote ?? "Not set"}</dd>
          </div>
          <div className="flex items-center justify-between border-t border-border pt-2">
            <dt className="text-muted">Logo</dt>
            <dd className="m-0">
              <span className={profile.hasLogo ? "chip pos" : "chip"}>{profile.hasLogo ? "Set" : "Not set"}</span>
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted">Payment QR</dt>
            <dd className="m-0">
              <span className={profile.hasPaymentQr ? "chip pos" : "chip"}>
                {profile.hasPaymentQr ? "Set" : "Not set"}
              </span>
            </dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}

export function QuickInvoiceDetailActions({
  orgSlug,
  id,
  invoiceNumber,
  status,
  canEdit,
  linkedInvoiceId,
  linkedInvoiceNumber,
}: {
  orgSlug: string;
  id: string;
  invoiceNumber: string;
  status: "draft" | "sent";
  canEdit: boolean;
  linkedInvoiceId: string | null;
  linkedInvoiceNumber: string | null;
}) {
  const router = useRouter();
  const base = `/${orgSlug}`;
  const [confirmSend, setConfirmSend] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <a href={`${base}/quick-invoices/${id}/pdf`} className={buttonClass("secondary", "sm")}>
          Download PDF
        </a>
        {canEdit && status === "draft" && (
          <>
            <Link href={`${base}/quick-invoices/${id}/edit`} className={buttonClass("secondary", "sm")}>
              Edit draft
            </Link>
            {!confirmSend ? (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setConfirmDelete(false);
                  setConfirmSend(true);
                }}
              >
                Mark Sent
              </Button>
            ) : (
              <div className="inline-flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-1.5 text-[12.5px]">
                <span className="text-ink">
                  Mark {invoiceNumber} as sent and add a draft invoice to Books?
                </span>
                <Button
                  type="button"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    setErr(null);
                    start(async () => {
                      const r = await markQuickInvoiceSentAction(orgSlug, id);
                      if (r.ok) {
                        setConfirmSend(false);
                        router.refresh();
                      } else {
                        setErr(r.error);
                      }
                    });
                  }}
                >
                  {pending ? "Working..." : "Confirm Mark Sent"}
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setConfirmSend(false)}>
                  Cancel
                </Button>
              </div>
            )}
            {!confirmDelete ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setConfirmSend(false);
                  setConfirmDelete(true);
                }}
              >
                Delete draft
              </Button>
            ) : (
              <div className="inline-flex items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => {
                    setErr(null);
                    start(async () => {
                      const r = await deleteQuickInvoiceDraftAction(orgSlug, id);
                      if (r.ok) {
                        router.push(`${base}/quick-invoices`);
                        router.refresh();
                      } else {
                        setErr(r.error);
                      }
                    });
                  }}
                >
                  {pending ? "Deleting..." : "Confirm delete"}
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
              </div>
            )}
          </>
        )}
        {status === "sent" && linkedInvoiceId && (
          <Link href={`${base}/invoices/${linkedInvoiceId}`} className={buttonClass("primary", "sm")}>
            Open in Books{linkedInvoiceNumber ? ` (${linkedInvoiceNumber})` : ""}
          </Link>
        )}
      </div>
      {err && (
        <p role="alert" className="m-0 text-[12.5px] text-negative">
          {err}
        </p>
      )}
    </div>
  );
}
