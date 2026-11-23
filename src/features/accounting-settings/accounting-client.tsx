"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/shared/ui/button";
import { Input, Select } from "@/shared/ui/form-controls";
import {
  createPriceBookItemAction,
  deleteExchangeRateAction,
  deletePriceBookItemAction,
  saveDocumentNumberingAction,
  saveExchangeRateAction,
  togglePriceBookItemAction,
  updatePriceBookItemAction,
} from "./actions";
import {
  COMMON_CURRENCIES,
  formatNumberingPreview,
  NUMBERING_PATTERNS,
  PRICE_BOOK_CATEGORIES,
  PRICE_BOOK_TAX_CODES,
  type DocNumberingRule,
  type ExchangeRateRow,
  type ExchangeRateSource,
  type NumberingPattern,
  type PriceBookCategory,
  type PriceBookItem,
  type PriceBookTaxCode,
} from "./types";

function formatRm(cents: number) {
  return `RM ${(cents / 100).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function taxLabel(code: PriceBookTaxCode) {
  return PRICE_BOOK_TAX_CODES.find((t) => t.value === code)?.label ?? code;
}

function catLabel(cat: PriceBookCategory) {
  return PRICE_BOOK_CATEGORIES.find((c) => c.value === cat)?.label ?? cat;
}

// -----------------------------------------------------------------------------
// 1. Document Numbering
// -----------------------------------------------------------------------------
function NumberingRow({ orgSlug, rule, canEdit }: { orgSlug: string; rule: DocNumberingRule; canEdit: boolean }) {
  const router = useRouter();
  const [prefix, setPrefix] = useState(rule.prefix);
  const [pattern, setPattern] = useState<NumberingPattern>(rule.pattern);
  const [padWidth, setPadWidth] = useState(rule.padWidth);
  const [nextNumber, setNextNumber] = useState(rule.nextNumber);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const dirty =
    prefix.trim().toUpperCase() !== rule.prefix ||
    pattern !== rule.pattern ||
    padWidth !== rule.padWidth ||
    nextNumber !== rule.nextNumber;

  const preview = formatNumberingPreview(prefix, pattern, padWidth, nextNumber);

  return (
    <tr className="border-t border-border align-middle" data-testid={`num-row-${rule.docType}`}>
      <td className="px-3.5 py-2.5">
        <div className="text-[13px] font-medium text-ink">{rule.label}</div>
        <div className="text-[11.5px] text-muted">{rule.group}</div>
      </td>
      <td className="px-2 py-2.5">
        <div className="w-[88px]">
          <Input
            aria-label={`${rule.label} prefix`}
            value={prefix}
            maxLength={12}
            disabled={!canEdit || pending}
            onChange={(e) => {
              setPrefix(e.target.value.toUpperCase());
              setMsg(null);
            }}
            className="h-[30px] text-[12.5px] uppercase"
          />
        </div>
      </td>
      <td className="px-2 py-2.5">
        <div className="min-w-[205px]">
          <Select
            aria-label={`${rule.label} pattern`}
            value={pattern}
            disabled={!canEdit || pending}
            onChange={(e) => {
              setPattern(e.target.value as NumberingPattern);
              setMsg(null);
            }}
            className="h-[30px] text-[12.5px]"
          >
            {NUMBERING_PATTERNS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.value === "{PREFIX}-{YYYY}{MM}-{SEQ}"
                  ? "Prefix-YYYYMM-Seq"
                  : p.value === "{PREFIX}-{YYYY}-{SEQ}"
                    ? "Prefix-YYYY-Seq"
                    : "Prefix-Seq"}
              </option>
            ))}
          </Select>
        </div>
      </td>
      <td className="px-2 py-2.5">
        <div className="w-[96px]">
          <Select
            aria-label={`${rule.label} digits`}
            value={String(padWidth)}
            disabled={!canEdit || pending}
            onChange={(e) => {
              setPadWidth(Number(e.target.value));
              setMsg(null);
            }}
            className="h-[30px] text-[12.5px]"
          >
            {[2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n} digits
              </option>
            ))}
          </Select>
        </div>
      </td>
      <td className="px-2 py-2.5">
        <div className="w-[78px]">
          <Input
            aria-label={`${rule.label} next number`}
            type="number"
            min={1}
            step={1}
            value={nextNumber}
            disabled={!canEdit || pending}
            onChange={(e) => {
              setNextNumber(Math.max(1, Number(e.target.value) || 1));
              setMsg(null);
            }}
            className="h-[30px] text-[12.5px] num"
          />
        </div>
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <code
          data-testid={`preview-${rule.docType}`}
          className="num rounded bg-surface-2 px-2 py-1 text-[12px] font-medium text-ink"
        >
          {preview}
        </code>
      </td>
      <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
        {canEdit ? (
          <div className="inline-flex items-center justify-end gap-2">
            {msg && <span className="text-[11.5px] font-medium text-positive">{msg}</span>}
            {err && <span role="alert" className="text-[11.5px] text-negative">{err}</span>}
            <Button
              type="button"
              size="sm"
              variant={dirty ? "primary" : "secondary"}
              disabled={pending || !dirty}
              onClick={() => {
                setMsg(null);
                setErr(null);
                start(async () => {
                  const r = await saveDocumentNumberingAction(orgSlug, {
                    docType: rule.docType,
                    prefix,
                    pattern,
                    padWidth,
                    nextNumber,
                  });
                  if (r.ok) {
                    setMsg("Saved");
                    router.refresh();
                  } else {
                    setErr(r.error);
                  }
                });
              }}
            >
              {pending ? "Saving..." : "Save"}
            </Button>
          </div>
        ) : (
          <span className="text-[12px] text-muted">Read only</span>
        )}
      </td>
    </tr>
  );
}

export function DocumentNumberingClient({
  orgSlug,
  rules,
  canEdit,
}: {
  orgSlug: string;
  rules: DocNumberingRule[];
  canEdit: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface">
      <table className="w-full border-collapse text-left text-[13px]">
        <thead>
          <tr className="bg-surface-2/60 text-[11px] font-semibold tracking-[0.04em] text-muted uppercase">
            <th className="px-3.5 py-2.5">Document</th>
            <th className="px-2 py-2.5">Prefix</th>
            <th className="px-2 py-2.5">Pattern</th>
            <th className="px-2 py-2.5">Padding</th>
            <th className="px-2 py-2.5">Next #</th>
            <th className="px-3 py-2.5">Preview</th>
            <th className="px-3.5 py-2.5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r) => (
            <NumberingRow key={r.docType} orgSlug={orgSlug} rule={r} canEdit={canEdit} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// -----------------------------------------------------------------------------
// 2. Price Book
// -----------------------------------------------------------------------------
function PriceBookRow({
  orgSlug,
  item,
  revenueAccounts,
  canEdit,
}: {
  orgSlug: string;
  item: PriceBookItem;
  revenueAccounts: Array<{ id: string; code: string; name: string }>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [sku, setSku] = useState(item.sku ?? "");
  const [category, setCategory] = useState<PriceBookCategory>(item.category);
  const [description, setDescription] = useState(item.description ?? "");
  const [priceStr, setPriceStr] = useState((item.unitPriceCents / 100).toFixed(2));
  const [taxCode, setTaxCode] = useState<PriceBookTaxCode>(item.taxCode);
  const [revId, setRevId] = useState(item.revenueAccountId ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (editing) {
    return (
      <tr className="border-t border-border bg-surface-2/40">
        <td colSpan={6} className="p-3.5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex min-w-0 flex-col gap-1">
              <label className="text-[12px] font-medium text-ink-2">Name *</label>
              <Input aria-label="Edit item name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label className="text-[12px] font-medium text-ink-2">SKU / Code</label>
              <Input aria-label="Edit SKU" value={sku} onChange={(e) => setSku(e.target.value)} />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label className="text-[12px] font-medium text-ink-2">Category</label>
              <Select aria-label="Edit category" value={category} onChange={(e) => setCategory(e.target.value as PriceBookCategory)}>
                {PRICE_BOOK_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label className="text-[12px] font-medium text-ink-2">Default price (RM)</label>
              <Input aria-label="Edit price" type="number" min="0" step="0.01" value={priceStr} onChange={(e) => setPriceStr(e.target.value)} />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label className="text-[12px] font-medium text-ink-2">SST treatment</label>
              <Select aria-label="Edit SST" value={taxCode} onChange={(e) => setTaxCode(e.target.value as PriceBookTaxCode)}>
                {PRICE_BOOK_TAX_CODES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label className="text-[12px] font-medium text-ink-2">Revenue account</label>
              <Select aria-label="Edit revenue account" value={revId} onChange={(e) => setRevId(e.target.value)}>
                <option value="">Default sales account</option>
                {revenueAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                ))}
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1 sm:col-span-3">
              <label className="text-[12px] font-medium text-ink-2">Default line description</label>
              <Input aria-label="Edit description" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>
          {err && <p role="alert" className="m-0 mt-2 text-[12px] text-negative">{err}</p>}
          <div className="mt-3 flex items-center justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() => {
                setErr(null);
                const cents = Math.round((Number(priceStr) || 0) * 100);
                start(async () => {
                  const r = await updatePriceBookItemAction(orgSlug, item.id, {
                    name,
                    sku,
                    category,
                    description,
                    unitPriceCents: cents,
                    taxCode,
                    revenueAccountId: revId || null,
                  });
                  if (r.ok) {
                    setEditing(false);
                    router.refresh();
                  } else {
                    setErr(r.error);
                  }
                });
              }}
            >
              {pending ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-border align-middle">
      <td className="px-3.5 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-ink">{item.name}</span>
          {item.sku && <code className="num rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">{item.sku}</code>}
          {!item.active && <span className="chip">Archived</span>}
        </div>
        {item.description && <div className="mt-0.5 text-[12px] text-muted">{item.description}</div>}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <span className="chip">{catLabel(item.category)}</span>
      </td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap num font-medium text-ink">
        {formatRm(item.unitPriceCents)}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap text-[12.5px] text-ink-2">{taxLabel(item.taxCode)}</td>
      <td className="px-3 py-2.5 text-[12.5px] text-muted">{item.revenueAccountLabel ?? "Default sales"}</td>
      <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
        {canEdit ? (
          <div className="inline-flex items-center gap-1">
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await togglePriceBookItemAction(orgSlug, item.id, !item.active);
                  router.refresh();
                })
              }
            >
              {item.active ? "Archive" : "Restore"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await deletePriceBookItemAction(orgSlug, item.id);
                  router.refresh();
                })
              }
            >
              Delete
            </Button>
          </div>
        ) : (
          <span className="text-[12px] text-muted">—</span>
        )}
      </td>
    </tr>
  );
}

export function PriceBookClient({
  orgSlug,
  items,
  revenueAccounts,
  canEdit,
}: {
  orgSlug: string;
  items: PriceBookItem[];
  revenueAccounts: Array<{ id: string; code: string; name: string }>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState<PriceBookCategory>("service");
  const [priceStr, setPriceStr] = useState("0.00");
  const [taxCode, setTaxCode] = useState<PriceBookTaxCode>("ST_8");
  const [revId, setRevId] = useState(revenueAccounts[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (!showArchived && !it.active) return false;
      if (catFilter !== "all" && it.category !== catFilter) return false;
      if (!q) return true;
      return (
        it.name.toLowerCase().includes(q) ||
        (it.sku ?? "").toLowerCase().includes(q) ||
        (it.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, query, catFilter, showArchived]);

  return (
    <div className="flex flex-col gap-5">
      {canEdit && (
        <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="m-0 text-[14px] font-semibold text-ink">Add an item</h2>
              <p className="m-0 mt-1 text-[12.5px] text-muted">
                Save products and services you sell so invoice lines fill in description, price, SST, and revenue account automatically.
              </p>
            </div>
            <Link href={`/${orgSlug}/inventory`} className="text-[12.5px] font-medium text-brand hover:underline">
              Track stock quantities in Inventory →
            </Link>
          </div>
          <form
            className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              setErr(null);
              setMsg(null);
              const cents = Math.round((Number(priceStr) || 0) * 100);
              start(async () => {
                const r = await createPriceBookItemAction(orgSlug, {
                  name,
                  sku,
                  category,
                  description,
                  unitPriceCents: cents,
                  taxCode,
                  revenueAccountId: revId || null,
                });
                if (r.ok) {
                  setName("");
                  setSku("");
                  setPriceStr("0.00");
                  setDescription("");
                  setMsg("Item added to price book.");
                  router.refresh();
                } else {
                  setErr(r.error);
                }
              });
            }}
          >
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="pb-name" className="text-[12.5px] font-medium text-ink-2">
                Name<span className="ml-0.5 text-negative">*</span>
              </label>
              <Input id="pb-name" required placeholder="e.g. Monthly Retainer or Arabica Beans 1kg" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="pb-sku" className="text-[12.5px] font-medium text-ink-2">SKU / Code</label>
              <Input id="pb-sku" placeholder="Optional, e.g. RET-01" value={sku} onChange={(e) => setSku(e.target.value)} />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="pb-cat" className="text-[12.5px] font-medium text-ink-2">Category</label>
              <Select id="pb-cat" value={category} onChange={(e) => setCategory(e.target.value as PriceBookCategory)}>
                {PRICE_BOOK_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="pb-price" className="text-[12.5px] font-medium text-ink-2">Default price (RM)</label>
              <Input id="pb-price" type="number" min="0" step="0.01" required value={priceStr} onChange={(e) => setPriceStr(e.target.value)} />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="pb-tax" className="text-[12.5px] font-medium text-ink-2">SST treatment</label>
              <Select id="pb-tax" value={taxCode} onChange={(e) => setTaxCode(e.target.value as PriceBookTaxCode)}>
                {PRICE_BOOK_TAX_CODES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="pb-rev" className="text-[12.5px] font-medium text-ink-2">Revenue account</label>
              <Select id="pb-rev" value={revId} onChange={(e) => setRevId(e.target.value)}>
                <option value="">Default sales account</option>
                {revenueAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                ))}
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1 sm:col-span-3">
              <label htmlFor="pb-desc" className="text-[12.5px] font-medium text-ink-2">Default line description</label>
              <Input id="pb-desc" placeholder="Printed on invoices and quotes (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 sm:col-span-3">
              <div className="text-[12.5px]">
                {msg && <span role="status" data-testid="pb-status" className="font-medium text-positive">{msg}</span>}
                {err && <span role="alert" className="text-negative">{err}</span>}
              </div>
              <Button type="submit" size="sm" className="h-[34px]" disabled={pending}>
                {pending ? "Adding..." : "Add item"}
              </Button>
            </div>
          </form>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 text-[13.5px] font-semibold text-ink">Saved items ({filtered.length})</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-[220px]">
              <Input
                aria-label="Search price book"
                placeholder="Search name or SKU..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-[30px] text-[12.5px]"
              />
            </div>
            <div className="w-[140px]">
              <Select
                aria-label="Filter by category"
                value={catFilter}
                onChange={(e) => setCatFilter(e.target.value)}
                className="h-[30px] text-[12.5px]"
              >
                <option value="all">All categories</option>
                {PRICE_BOOK_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </Select>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-[12.5px] text-muted">
              <input type="checkbox" className="accent-brand" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Show archived
            </label>
          </div>
        </div>

        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface">
          <table className="w-full border-collapse text-left text-[13px]" data-testid="price-book-table">
            <thead>
              <tr className="bg-surface-2/60 text-[11px] font-semibold tracking-[0.04em] text-muted uppercase">
                <th className="px-3.5 py-2.5">Item</th>
                <th className="px-3 py-2.5">Category</th>
                <th className="px-3 py-2.5 text-right">Default price</th>
                <th className="px-3 py-2.5">SST</th>
                <th className="px-3 py-2.5">Revenue account</th>
                <th className="px-3.5 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[13px] text-muted">
                    No price book items yet. Add what you sell above to speed up invoicing.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <PriceBookRow key={item.id} orgSlug={orgSlug} item={item} revenueAccounts={revenueAccounts} canEdit={canEdit} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// -----------------------------------------------------------------------------
// 3. Exchange Rates
// -----------------------------------------------------------------------------
export function ExchangeRatesClient({
  orgSlug,
  rates,
  canEdit,
}: {
  orgSlug: string;
  rates: ExchangeRateRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [ccy, setCcy] = useState("USD");
  const [rateDate, setRateDate] = useState(today);
  const [rateStr, setRateStr] = useState("4.4500");
  const [source, setSource] = useState<ExchangeRateSource>("bank");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const numericRate = Number(rateStr);
  const validRate = Number.isFinite(numericRate) && numericRate > 0;

  // Latest rate per currency
  const latestByCurrency = useMemo(() => {
    const map = new Map<string, ExchangeRateRow>();
    for (const r of rates) {
      if (!map.has(r.currencyCode)) map.set(r.currencyCode, r);
    }
    return Array.from(map.values()).sort((a, b) => a.currencyCode.localeCompare(b.currencyCode));
  }, [rates]);

  return (
    <div className="flex flex-col gap-5">
      {canEdit && (
        <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-5">
          <h2 className="m-0 text-[14px] font-semibold text-ink">Record an exchange rate</h2>
          <p className="m-0 mt-1 text-[12.5px] text-muted">
            Enter the rate as ringgit (MYR) per 1 unit of the foreign currency. Kira keeps your entered bank or BNM rates for foreign currency documents and revaluation.
          </p>
          <form
            className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4"
            onSubmit={(e) => {
              e.preventDefault();
              setErr(null);
              setMsg(null);
              if (!validRate) {
                setErr("Enter a positive exchange rate.");
                return;
              }
              start(async () => {
                const r = await saveExchangeRateAction(orgSlug, {
                  currencyCode: ccy,
                  rateDate,
                  rate: numericRate,
                  source,
                  note,
                });
                if (r.ok) {
                  setNote("");
                  setMsg(`Saved 1 ${ccy} = RM ${numericRate.toFixed(4)} for ${rateDate}.`);
                  router.refresh();
                } else {
                  setErr(r.error);
                }
              });
            }}
          >
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="fx-ccy" className="text-[12.5px] font-medium text-ink-2">Currency</label>
              <Select id="fx-ccy" value={ccy} onChange={(e) => setCcy(e.target.value)}>
                {COMMON_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.code} · {c.name}</option>
                ))}
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="fx-date" className="text-[12.5px] font-medium text-ink-2">Date</label>
              <Input id="fx-date" type="date" required value={rateDate} onChange={(e) => setRateDate(e.target.value)} />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="fx-rate" className="text-[12.5px] font-medium text-ink-2">
                MYR per 1 {ccy}<span className="ml-0.5 text-negative">*</span>
              </label>
              <Input
                id="fx-rate"
                type="number"
                min="0.000001"
                step="any"
                required
                value={rateStr}
                onChange={(e) => setRateStr(e.target.value)}
                className="num"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="fx-source" className="text-[12.5px] font-medium text-ink-2">Source</label>
              <Select id="fx-source" value={source} onChange={(e) => setSource(e.target.value as ExchangeRateSource)}>
                <option value="bank">Bank rate</option>
                <option value="bnm">BNM reference</option>
                <option value="manual">Manual</option>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1 sm:col-span-3">
              <label htmlFor="fx-note" className="text-[12.5px] font-medium text-ink-2">Note</label>
              <Input id="fx-note" placeholder="Optional reference, e.g. Maybank TT selling rate" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="flex items-end justify-end">
              <Button type="submit" size="sm" className="h-[34px] w-full sm:w-auto" disabled={pending}>
                {pending ? "Saving..." : "Save rate"}
              </Button>
            </div>
          </form>

          {validRate && (
            <div className="mt-3 rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2 text-[12px] text-ink-2 num">
              1 {ccy} = RM {numericRate.toFixed(4)} &nbsp;·&nbsp; RM 100.00 = {ccy} {(100 / numericRate).toFixed(2)}
            </div>
          )}
          {msg && <p role="status" data-testid="fx-status" className="m-0 mt-2 text-[12.5px] font-medium text-positive">{msg}</p>}
          {err && <p role="alert" className="m-0 mt-2 text-[12.5px] text-negative">{err}</p>}
        </section>
      )}

      {latestByCurrency.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="m-0 text-[13.5px] font-semibold text-ink">Latest rates (base MYR)</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {latestByCurrency.map((r) => (
              <div key={r.currencyCode} className="rounded-[var(--radius-lg)] border border-border bg-surface p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-semibold text-ink">{r.currencyCode} / MYR</span>
                  <span className="chip">{r.source.toUpperCase()}</span>
                </div>
                <div className="num mt-1.5 text-[18px] font-semibold text-ink">RM {r.rate.toFixed(4)}</div>
                <div className="mt-0.5 text-[11.5px] text-muted">As at {r.rateDate}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2.5">
        <h2 className="m-0 text-[13.5px] font-semibold text-ink">Rate history ({rates.length})</h2>
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface">
          <table className="w-full border-collapse text-left text-[13px]" data-testid="fx-table">
            <thead>
              <tr className="bg-surface-2/60 text-[11px] font-semibold tracking-[0.04em] text-muted uppercase">
                <th className="px-3.5 py-2.5">Date</th>
                <th className="px-3 py-2.5">Currency</th>
                <th className="px-3 py-2.5 text-right">MYR per 1 unit</th>
                <th className="px-3 py-2.5">Source</th>
                <th className="px-3 py-2.5">Note</th>
                <th className="px-3.5 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[13px] text-muted">
                    No exchange rates recorded yet. Add a bank or BNM rate above.
                  </td>
                </tr>
              ) : (
                rates.map((r) => (
                  <tr key={r.id} className="border-t border-border align-middle">
                    <td className="px-3.5 py-2.5 whitespace-nowrap num text-ink">{r.rateDate}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-medium text-ink">{r.currencyCode}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap num font-medium text-ink">RM {r.rate.toFixed(4)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="chip">{r.source === "bnm" ? "BNM" : r.source === "bank" ? "Bank" : "Manual"}</span>
                    </td>
                    <td className="px-3 py-2.5 text-[12.5px] text-muted">{r.note ?? "—"}</td>
                    <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                      {canEdit ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() =>
                            start(async () => {
                              await deleteExchangeRateAction(orgSlug, r.id);
                              router.refresh();
                            })
                          }
                        >
                          Delete
                        </Button>
                      ) : (
                        <span className="text-[12px] text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
