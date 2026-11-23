"use client";

import { Download, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { rm } from "@/features/books/money";
import { Button } from "@/shared/ui/button";
import { Input, Select } from "@/shared/ui/form-controls";
import {
  archiveLocationAction,
  cancelStocktakeAction,
  confirmStocktakeAction,
  createLocationAction,
  createStockItemAction,
  enableInventoryAction,
  importOpeningStockAction,
  openStocktakeAction,
  recordTransferAction,
  recordWritedownAction,
  saveStocktakeCountsAction,
  setDefaultLocationAction,
  updateStockItemAction,
} from "./actions";
import {
  SAMPLE_OPENING_STOCK_CSV,
  type CostingMethod,
  type EquityAccountChoice,
  type LocationRow,
  type StockItemRow,
  type StocktakeLineRow,
} from "./types";

export function EnableInventoryCard({ orgSlug, canAdmin }: { orgSlug: string; canAdmin: boolean }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <section className="flex max-w-2xl flex-col gap-4 rounded-[var(--radius-lg)] border border-border bg-surface p-6">
      <div>
        <h2 className="m-0 text-[16px] font-semibold text-ink">Turn on stock tracking</h2>
        <p className="m-0 mt-1.5 text-[13px] leading-relaxed text-muted">
          Know what you hold, what it cost, and what it is worth. Turning this on links your Stock asset and Cost of
          Goods Sold accounts, adds Stock Adjustments and Write-downs (700-0400), and creates a default Main store
          location.
        </p>
      </div>
      <div className="rounded-[var(--radius)] border border-border bg-surface-2/60 p-3.5 text-[12.5px]">
        <div className="font-medium text-ink">Accounts Kira uses</div>
        <ul className="m-0 mt-1.5 list-disc space-y-1 pl-5 text-ink-2">
          <li>
            <span className="num">300-0100</span> · Inventory (Stock asset)
          </li>
          <li>
            <span className="num">700-0100</span> · Purchases / Cost of Goods Sold
          </li>
          <li>
            <span className="num">700-0400</span> · Stock Adjustments and Write-downs
          </li>
        </ul>
      </div>
      {err && (
        <p role="alert" className="m-0 text-[12.5px] text-negative">
          {err}
        </p>
      )}
      {canAdmin ? (
        <div>
          <Button
            type="button"
            disabled={pending}
            onClick={() => {
              setErr(null);
              start(async () => {
                const r = await enableInventoryAction(orgSlug);
                if (r.ok) router.refresh();
                else setErr(r.error);
              });
            }}
          >
            {pending ? "Turning on..." : "Turn on stock tracking"}
          </Button>
        </div>
      ) : (
        <p className="m-0 text-[12.5px] text-muted">Ask an owner or admin to turn on stock tracking.</p>
      )}
    </section>
  );
}

export function TrackItemForm({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [uom, setUom] = useState("unit");
  const [costingMethod, setCostingMethod] = useState<CostingMethod>("moving_average");
  const [reorderPoint, setReorderPoint] = useState("");
  const [reorderQuantity, setReorderQuantity] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-5">
      <h2 className="m-0 text-[14px] font-semibold text-ink">Track an item</h2>
      <p className="m-0 mt-1 text-[12.5px] text-muted">
        Set a unit of measure, costing method (FIFO or Moving weighted average), and optional reorder point.
      </p>
      <form
        className="mt-4 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setMsg(null);
          setErr(null);
          start(async () => {
            const r = await createStockItemAction(orgSlug, {
              name,
              sku,
              uom,
              costingMethod,
              reorderPoint,
              reorderQuantity,
            });
            if (r.ok) {
              setMsg(`Now tracking "${name.trim()}".`);
              setName("");
              setSku("");
              setReorderPoint("");
              setReorderQuantity("");
              router.refresh();
            } else {
              setErr(r.error);
            }
          });
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="flex min-w-0 flex-col gap-1 sm:col-span-2">
            <label htmlFor="it-name" className="text-[12.5px] font-medium text-ink-2">
              Item name<span className="ml-0.5 text-negative">*</span>
            </label>
            <Input id="it-name" required placeholder="e.g. Arabica Coffee Beans 1kg" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="it-sku" className="text-[12.5px] font-medium text-ink-2">
              SKU (optional)
            </label>
            <Input id="it-sku" placeholder="e.g. COF-001" value={sku} onChange={(e) => setSku(e.target.value)} />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="it-uom" className="text-[12.5px] font-medium text-ink-2">
              Unit of measure<span className="ml-0.5 text-negative">*</span>
            </label>
            <Input id="it-uom" required placeholder="unit, kg, box" value={uom} onChange={(e) => setUom(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="it-costing" className="text-[12.5px] font-medium text-ink-2">
              Costing method
            </label>
            <Select id="it-costing" value={costingMethod} onChange={(e) => setCostingMethod(e.target.value as CostingMethod)}>
              <option value="moving_average">Moving weighted average</option>
              <option value="fifo">FIFO (first in, first out)</option>
            </Select>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="it-rp" className="text-[12.5px] font-medium text-ink-2">
              Reorder point (optional)
            </label>
            <Input id="it-rp" type="number" step="any" min="0" placeholder="e.g. 10" value={reorderPoint} onChange={(e) => setReorderPoint(e.target.value)} />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="it-rq" className="text-[12.5px] font-medium text-ink-2">
              Reorder quantity (optional)
            </label>
            <Input id="it-rq" type="number" step="any" min="0" placeholder="e.g. 50" value={reorderQuantity} onChange={(e) => setReorderQuantity(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="text-[12.5px]">
            {err && <span role="alert" className="text-negative">{err}</span>}
            {msg && <span role="status" className="font-medium text-positive">{msg}</span>}
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving..." : "Track this item"}
          </Button>
        </div>
      </form>
    </section>
  );
}

export function EditStockItemInline({ orgSlug, item }: { orgSlug: string; item: StockItemRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [uom, setUom] = useState(item.uom);
  const [costing, setCosting] = useState<CostingMethod>(item.costingMethod);
  const [rp, setRp] = useState(item.reorderPoint != null ? String(item.reorderPoint) : "");
  const rq = item.reorderQuantity != null ? String(item.reorderQuantity) : "";
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Edit
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5 rounded-[var(--radius)] border border-border bg-surface-2 p-2 text-left">
      <div className="w-[72px]">
        <Input aria-label={`UOM for ${item.name}`} className="h-[28px] text-[12px]" value={uom} onChange={(e) => setUom(e.target.value)} />
      </div>
      <div className="w-[90px]">
        <Input aria-label={`Reorder point for ${item.name}`} type="number" step="any" min="0" placeholder="Reorder pt" className="h-[28px] text-[12px]" value={rp} onChange={(e) => setRp(e.target.value)} />
      </div>
      {!item.hasMovements && (
        <div className="w-[140px]">
          <Select aria-label={`Costing for ${item.name}`} className="h-[28px] text-[12px]" value={costing} onChange={(e) => setCosting(e.target.value as CostingMethod)}>
            <option value="moving_average">Moving avg</option>
            <option value="fifo">FIFO</option>
          </Select>
        </div>
      )}
      <Button
        type="button"
        size="sm"
        disabled={pending}
        onClick={() => {
          setErr(null);
          start(async () => {
            const r = await updateStockItemAction(orgSlug, item.id, {
              uom,
              costingMethod: costing,
              reorderPoint: rp,
              reorderQuantity: rq,
            });
            if (r.ok) {
              setOpen(false);
              router.refresh();
            } else {
              setErr(r.error);
            }
          });
        }}
      >
        {pending ? "Saving..." : "Save"}
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
        Cancel
      </Button>
      {err && <span role="alert" className="w-full text-[11px] text-negative">{err}</span>}
    </div>
  );
}

export function AddLocationForm({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-5">
      <h2 className="m-0 text-[14px] font-semibold text-ink">Add a location</h2>
      <p className="m-0 mt-1 text-[12.5px] text-muted">What you call the place: Main store, Warehouse A.</p>
      <form
        className="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setMsg(null);
          setErr(null);
          start(async () => {
            const r = await createLocationAction(orgSlug, name);
            if (r.ok) {
              setMsg("Location added.");
              setName("");
              router.refresh();
            } else {
              setErr(r.error);
            }
          });
        }}
      >
        <div className="min-w-[240px] flex-1">
          <label htmlFor="loc-name" className="mb-1 block text-[12.5px] font-medium text-ink-2">
            Name<span className="ml-0.5 text-negative">*</span>
          </label>
          <Input id="loc-name" required placeholder="e.g. Warehouse A" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button type="submit" size="sm" className="h-[34px]" disabled={pending}>
          {pending ? "Adding..." : "Add location"}
        </Button>
      </form>
      {msg && <p role="status" className="m-0 mt-2 text-[12.5px] font-medium text-positive">{msg}</p>}
      {err && <p role="alert" className="m-0 mt-2 text-[12.5px] text-negative">{err}</p>}
    </section>
  );
}

export function LocationRowActions({ orgSlug, loc }: { orgSlug: string; loc: LocationRow }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (loc.archivedAt) return <span className="text-muted">–</span>;

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <div className="inline-flex items-center gap-1.5">
        {!loc.isDefault && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              setErr(null);
              start(async () => {
                const r = await setDefaultLocationAction(orgSlug, loc.id);
                if (r.ok) router.refresh();
                else setErr(r.error);
              });
            }}
          >
            Make default
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setErr(null);
            start(async () => {
              const r = await archiveLocationAction(orgSlug, loc.id);
              if (r.ok) router.refresh();
              else setErr(r.error);
            });
          }}
        >
          Archive
        </Button>
      </div>
      {err && <span role="alert" className="text-[11.5px] text-negative">{err}</span>}
    </div>
  );
}

export function OpeningStockImporter({
  orgSlug,
  today,
  locations,
  equityAccounts,
  existingItems,
}: {
  orgSlug: string;
  today: string;
  locations: LocationRow[];
  equityAccounts: EquityAccountChoice[];
  existingItems: string[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const defaultEq = equityAccounts.find((a) => a.section === "retained_earnings") ?? equityAccounts[0];
  const [openingDate, setOpeningDate] = useState(today);
  const [counterAccountId, setCounterAccountId] = useState(defaultEq?.id ?? "");
  const [defaultCosting, setDefaultCosting] = useState<CostingMethod>("moving_average");
  const [csv, setCsv] = useState(SAMPLE_OPENING_STOCK_CSV);
  const [dryRun, setDryRun] = useState<{
    ok: boolean;
    rows: { item: string; quantity: string; unitCost: string; location: string; uom: string; costingMethod: string }[];
    errors: { row: number; reason: string }[];
    newItems: number;
    totalSen: number;
  } | null>(null);
  const [result, setResult] = useState<{
    itemsCreated: number;
    movements: number;
    totalCost: number;
    journalEntryId: string | null;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const locNames = useMemo(() => new Set(locations.map((l) => l.name.toLowerCase())), [locations]);
  const existingSet = useMemo(() => new Set(existingItems.map((n) => n.toLowerCase())), [existingItems]);

  const parseAndValidate = () => {
    const lines = csv
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) {
      return { ok: false, rows: [], errors: [{ row: 1, reason: "Add a header line and at least one data row." }], newItems: 0, totalSen: 0 };
    }
    const hdr = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const idx = (names: string[]) => hdr.findIndex((h) => names.includes(h));
    const iItem = idx(["item", "name"]);
    const iQty = idx(["quantity", "qty"]);
    const iCost = idx(["unit_cost", "unit cost", "cost"]);
    const iLoc = idx(["location"]);
    const iUom = idx(["uom", "unit"]);
    const iMethod = idx(["costing_method", "costing"]);

    if (iItem < 0 || iQty < 0 || iCost < 0 || iLoc < 0) {
      return {
        ok: false,
        rows: [],
        errors: [{ row: 1, reason: "Header must include item, quantity, unit_cost, location." }],
        newItems: 0,
        totalSen: 0,
      };
    }

    const parsed: { item: string; quantity: string; unitCost: string; location: string; uom: string; costingMethod: string }[] = [];
    const errors: { row: number; reason: string }[] = [];
    const seenNew = new Set<string>();
    let totalSen = 0;

    for (let r = 1; r < lines.length; r++) {
      const cols = lines[r].split(",").map((c) => c.trim());
      const item = cols[iItem] ?? "";
      const qtyNum = Number(cols[iQty]);
      const costNum = Number(cols[iCost]);
      const location = cols[iLoc] ?? "";
      const uom = iUom >= 0 && cols[iUom] ? cols[iUom] : "unit";
      const costingMethod = iMethod >= 0 && cols[iMethod] ? cols[iMethod] : defaultCosting;

      if (!item) errors.push({ row: r + 1, reason: "Missing item name." });
      else if (!Number.isFinite(qtyNum) || qtyNum <= 0) errors.push({ row: r + 1, reason: "Quantity must be greater than zero." });
      else if (!Number.isFinite(costNum) || costNum < 0) errors.push({ row: r + 1, reason: "Unit cost must be zero or more." });
      else if (!location || !locNames.has(location.toLowerCase())) {
        errors.push({ row: r + 1, reason: `Unknown location "${location}". Add it under Stock locations first.` });
      } else {
        if (!existingSet.has(item.toLowerCase())) seenNew.add(item.toLowerCase());
        totalSen += Math.round(qtyNum * costNum * 100);
        parsed.push({
          item,
          quantity: String(qtyNum),
          unitCost: costNum.toFixed(2),
          location,
          uom,
          costingMethod,
        });
      }
    }

    return { ok: errors.length === 0 && parsed.length > 0, rows: parsed, errors, newItems: seenNew.size, totalSen };
  };

  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-border bg-surface p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="os-date" className="text-[12.5px] font-medium text-ink-2">
            Opening date<span className="ml-0.5 text-negative">*</span>
          </label>
          <Input id="os-date" type="date" value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="os-counter" className="text-[12.5px] font-medium text-ink-2">
            Counter account<span className="ml-0.5 text-negative">*</span>
          </label>
          <Select id="os-counter" value={counterAccountId} onChange={(e) => setCounterAccountId(e.target.value)}>
            {equityAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} · {a.name}
              </option>
            ))}
          </Select>
          <span className="text-[11.5px] text-muted">The equity account the opening balance is credited to.</span>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="os-costing" className="text-[12.5px] font-medium text-ink-2">
            Default costing method
          </label>
          <Select id="os-costing" value={defaultCosting} onChange={(e) => setDefaultCosting(e.target.value as CostingMethod)}>
            <option value="moving_average">Moving weighted average</option>
            <option value="fifo">FIFO</option>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="os-csv" className="text-[12.5px] font-medium text-ink-2">
            Opening stock (CSV)
          </label>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                const blob = new Blob([SAMPLE_OPENING_STOCK_CSV], { type: "text/csv;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "kira-opening-stock-sample.csv";
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download size={12} aria-hidden="true" /> Download the sample CSV
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,text/csv"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setCsv(await f.text());
                e.target.value = "";
              }}
            />
            <Button type="button" size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
              Choose a file
            </Button>
          </div>
        </div>
        <textarea
          id="os-csv"
          rows={6}
          className="w-full rounded-[var(--radius)] border border-border-strong bg-surface p-3 font-mono text-[12px] text-ink outline-none focus:border-ink"
          value={csv}
          onChange={(e) => {
            setCsv(e.target.value);
            setDryRun(null);
          }}
        />
        <span className="text-[11.5px] text-muted">
          Required columns: <code>item</code>, <code>quantity</code>, <code>unit_cost</code>, <code>location</code>. Optional: <code>uom</code>, <code>costing_method</code>.
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            setErr(null);
            setResult(null);
            setDryRun(parseAndValidate());
          }}
        >
          Validate (dry run)
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => {
            setErr(null);
            setResult(null);
            const check = parseAndValidate();
            setDryRun(check);
            if (!check.ok) return;
            start(async () => {
              const r = await importOpeningStockAction(orgSlug, {
                openingDate,
                counterAccountId,
                defaultCosting,
                rows: check.rows,
              });
              if (r.ok) {
                setResult(r);
                router.refresh();
              } else {
                setErr(r.error);
              }
            });
          }}
        >
          {pending ? "Importing..." : "Import"}
        </Button>
      </div>

      {dryRun && dryRun.ok && !result && (
        <p role="status" data-testid="os-dryrun-ok" className="m-0 text-[12.5px] font-medium text-positive">
          Every row is valid: {dryRun.rows.length} row(s), {dryRun.newItems} item(s) to create, total cost{" "}
          <span className="num-sans">{rm(dryRun.totalSen)}</span>.
        </p>
      )}

      {dryRun && !dryRun.ok && (
        <div role="alert" data-testid="os-errors" className="rounded-[var(--radius)] border border-negative/30 bg-surface-2 p-3 text-[12.5px] text-negative">
          <div className="font-semibold">Rows to fix</div>
          <ul className="m-0 mt-1 list-disc pl-5">
            {dryRun.errors.map((e, i) => (
              <li key={i}>
                Row {e.row}: {e.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {err && <p role="alert" className="m-0 text-[12.5px] text-negative">{err}</p>}

      {result && (
        <p role="status" data-testid="os-imported" className="m-0 text-[13px] font-medium text-positive">
          Imported: {result.itemsCreated} item(s) created, {result.movements} movement(s) recorded, total cost{" "}
          <span className="num-sans">{rm(Math.round(result.totalCost * 100))}</span>.
          {result.journalEntryId && (
            <>
              {" "}
              <Link href={`/${orgSlug}/ledger/entries/${result.journalEntryId}`} className="text-brand underline">
                View opening journal
              </Link>
            </>
          )}
        </p>
      )}
    </section>
  );
}

export function StockTransferForm({
  orgSlug,
  today,
  locations,
  items,
}: {
  orgSlug: string;
  today: string;
  locations: LocationRow[];
  items: StockItemRow[];
}) {
  const router = useRouter();
  const [fromId, setFromId] = useState(locations[0]?.id ?? "");
  const [toId, setToId] = useState(locations[1]?.id ?? locations[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState([{ itemId: items[0]?.id ?? "", quantity: "1" }]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-5">
      <h2 className="m-0 text-[14px] font-semibold text-ink">New transfer</h2>
      <form
        className="mt-4 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setMsg(null);
          setErr(null);
          start(async () => {
            const r = await recordTransferAction(orgSlug, {
              fromLocationId: fromId,
              toLocationId: toId,
              occurredOn: date,
              memo,
              lines,
            });
            if (r.ok) {
              setMsg("Transfer recorded.");
              setMemo("");
              router.refresh();
            } else {
              setErr(r.error);
            }
          });
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="stf-from" className="text-[12.5px] font-medium text-ink-2">From</label>
            <Select id="stf-from" value={fromId} onChange={(e) => setFromId(e.target.value)}>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="stf-to" className="text-[12.5px] font-medium text-ink-2">To</label>
            <Select id="stf-to" value={toId} onChange={(e) => setToId(e.target.value)}>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="stf-date" className="text-[12.5px] font-medium text-ink-2">Date</label>
            <Input id="stf-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] font-medium text-ink-2">Items</span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setLines((prev) => [...prev, { itemId: items[0]?.id ?? "", quantity: "1" }])}
            >
              <Plus size={12} aria-hidden="true" /> Add a line
            </Button>
          </div>
          {lines.map((l, idx) => (
            <div
              key={idx}
              className={
                lines.length > 1
                  ? "grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_auto] sm:items-center"
                  : "grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px] sm:items-center"
              }
            >
              <Select
                aria-label={`Transfer line ${idx + 1} item`}
                value={l.itemId}
                onChange={(e) => setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, itemId: e.target.value } : x)))}
              >
                {items.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.name} ({it.onHand} {it.uom} total)
                  </option>
                ))}
              </Select>
              <Input
                aria-label={`Transfer line ${idx + 1} quantity`}
                type="number"
                step="any"
                min="0.0001"
                required
                value={l.quantity}
                onChange={(e) => setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))}
              />
              {lines.length > 1 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove line ${idx + 1}`}
                  onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                >
                  <Trash2 size={13} aria-hidden="true" />
                </Button>
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="stf-memo" className="text-[12.5px] font-medium text-ink-2">Memo (optional)</label>
          <Input id="stf-memo" placeholder="e.g. Restock outlet" value={memo} onChange={(e) => setMemo(e.target.value)} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="text-[12.5px]">
            {msg && <span role="status" className="font-medium text-positive">{msg}</span>}
            {err && <span role="alert" className="text-negative">{err}</span>}
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Recording..." : "Record transfer"}
          </Button>
        </div>
      </form>
    </section>
  );
}

export function OpenStocktakeForm({
  orgSlug,
  today,
  locations,
}: {
  orgSlug: string;
  today: string;
  locations: LocationRow[];
}) {
  const router = useRouter();
  const [locId, setLocId] = useState(locations[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [memo, setMemo] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-5">
      <h2 className="m-0 text-[14px] font-semibold text-ink">Open a stocktake</h2>
      <p className="m-0 mt-1 text-[12.5px] text-muted">
        Opening a stocktake freezes movements at that location until you confirm or cancel it.
      </p>
      <form
        className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_160px_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          setErr(null);
          start(async () => {
            const r = await openStocktakeAction(orgSlug, locId, date, memo);
            if (r.ok) {
              router.push(`/${orgSlug}/inventory/stocktakes/${r.id}`);
              router.refresh();
            } else {
              setErr(r.error);
            }
          });
        }}
      >
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="stk-loc" className="text-[12.5px] font-medium text-ink-2">Location</label>
          <Select id="stk-loc" value={locId} onChange={(e) => setLocId(e.target.value)}>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="stk-date" className="text-[12.5px] font-medium text-ink-2">Opened on</label>
          <Input id="stk-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="stk-memo" className="text-[12.5px] font-medium text-ink-2">Memo (optional)</label>
          <Input id="stk-memo" placeholder="Who counted, or why" value={memo} onChange={(e) => setMemo(e.target.value)} />
        </div>
        <Button type="submit" size="sm" className="h-[34px]" disabled={pending}>
          {pending ? "Opening..." : "Open stocktake"}
        </Button>
      </form>
      {err && <p role="alert" className="m-0 mt-2 text-[12.5px] text-negative">{err}</p>}
    </section>
  );
}

export function StocktakeCountEditor({
  orgSlug,
  stocktakeId,
  lines,
  isOpen,
  canEdit,
}: {
  orgSlug: string;
  stocktakeId: string;
  lines: StocktakeLineRow[];
  isOpen: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [counts, setCounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((l) => [l.id, l.countedQty != null ? String(l.countedQty) : ""])),
  );
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
        <table className="w-full border-collapse text-[13px]" data-testid="stocktake-lines">
          <thead className="bg-surface">
            <tr>
              <th className="border-b border-border px-4 py-2 text-left text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted">Item</th>
              <th className="border-b border-border px-4 py-2 text-right text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted">Book quantity</th>
              <th className="border-b border-border px-4 py-2 text-right text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted">Counted</th>
              <th className="border-b border-border px-4 py-2 text-right text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted">Variance</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const raw = counts[l.id] ?? "";
              const hasVal = raw.trim() !== "";
              const diff = hasVal ? Number(raw) - l.bookQty : null;
              return (
                <tr key={l.id} className="border-t border-border">
                  <td className="px-4 py-2.5 font-medium text-ink">
                    {l.itemName} <span className="text-[11.5px] font-normal text-muted">({l.uom})</span>
                  </td>
                  <td className="num px-4 py-2.5 text-right text-ink-2">{l.bookQty}</td>
                  <td className="w-[150px] px-4 py-2 text-right">
                    {isOpen && canEdit ? (
                      <Input
                        aria-label={`Counted quantity for ${l.itemName}`}
                        type="number"
                        step="any"
                        min="0"
                        placeholder="Not counted"
                        className="h-[30px] text-right"
                        value={raw}
                        onChange={(e) => setCounts((prev) => ({ ...prev, [l.id]: e.target.value }))}
                      />
                    ) : (
                      <span className="num text-ink">{hasVal ? raw : "Not counted"}</span>
                    )}
                  </td>
                  <td className="num px-4 py-2.5 text-right font-medium">
                    {diff === null ? (
                      <span className="text-muted">–</span>
                    ) : diff === 0 ? (
                      <span className="text-ink-2">0</span>
                    ) : (
                      <span className={diff > 0 ? "text-positive" : "text-negative"}>
                        {diff > 0 ? `+${diff}` : diff}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isOpen && canEdit && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[12.5px]">
            {msg && <span role="status" className="font-medium text-positive">{msg}</span>}
            {err && <span role="alert" className="text-negative">{err}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                setMsg(null);
                setErr(null);
                start(async () => {
                  const r = await saveStocktakeCountsAction(
                    orgSlug,
                    stocktakeId,
                    lines.map((l) => ({ lineId: l.id, counted: counts[l.id] ?? "" })),
                  );
                  if (r.ok) {
                    setMsg("Counts saved.");
                    router.refresh();
                  } else {
                    setErr(r.error);
                  }
                });
              }}
            >
              Save counts
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() => {
                setMsg(null);
                setErr(null);
                start(async () => {
                  const saved = await saveStocktakeCountsAction(
                    orgSlug,
                    stocktakeId,
                    lines.map((l) => ({ lineId: l.id, counted: counts[l.id] ?? "" })),
                  );
                  if (!saved.ok) {
                    setErr(saved.error);
                    return;
                  }
                  const r = await confirmStocktakeAction(orgSlug, stocktakeId);
                  if (r.ok) {
                    setMsg(`Stocktake confirmed (${r.adjustments} adjustment(s)).`);
                    router.refresh();
                  } else {
                    setErr(r.error);
                  }
                });
              }}
            >
              {pending ? "Confirming..." : "Confirm stocktake"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setErr(null);
                start(async () => {
                  const r = await cancelStocktakeAction(orgSlug, stocktakeId);
                  if (r.ok) router.refresh();
                  else setErr(r.error);
                });
              }}
            >
              Cancel stocktake
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function WritedownForm({
  orgSlug,
  today,
  items,
}: {
  orgSlug: string;
  today: string;
  items: StockItemRow[];
}) {
  const router = useRouter();
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-5">
      <h2 className="m-0 text-[14px] font-semibold text-ink">Record a write-down</h2>
      <p className="m-0 mt-1 text-[12.5px] text-muted">
        Posts Dr 700-0400 Stock Adjustments and Write-downs, Cr 300-0100 Inventory. Quantity stays unchanged.
      </p>
      <form
        className="mt-4 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setMsg(null);
          setErr(null);
          start(async () => {
            const r = await recordWritedownAction(orgSlug, { itemId, occurredOn: date, amount, reason });
            if (r.ok) {
              setMsg("Write-down recorded.");
              setAmount("");
              setReason("");
              router.refresh();
            } else {
              setErr(r.error);
            }
          });
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="wd-item" className="text-[12.5px] font-medium text-ink-2">Item</label>
            <Select id="wd-item" value={itemId} onChange={(e) => setItemId(e.target.value)}>
              {items.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name} — carried at {rm(it.valueSen)}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="wd-date" className="text-[12.5px] font-medium text-ink-2">Date</label>
            <Input id="wd-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="wd-amt" className="text-[12.5px] font-medium text-ink-2">Amount (RM)</label>
            <Input id="wd-amt" type="number" step="0.01" min="0.01" required placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="wd-reason" className="text-[12.5px] font-medium text-ink-2">
            Reason<span className="ml-0.5 text-negative">*</span>
          </label>
          <Input id="wd-reason" required placeholder="Damaged, expired, or the price it will now fetch" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="text-[12.5px]">
            {msg && <span role="status" className="font-medium text-positive">{msg}</span>}
            {err && <span role="alert" className="text-negative">{err}</span>}
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Recording..." : "Record write-down"}
          </Button>
        </div>
      </form>
    </section>
  );
}
