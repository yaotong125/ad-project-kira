import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { rm } from "@/features/books/money";
import type { OrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { cn } from "@/shared/ui/cn";
import {
  AddLocationForm,
  EditStockItemInline,
  EnableInventoryCard,
  LocationRowActions,
  OpenStocktakeForm,
  OpeningStockImporter,
  StockTransferForm,
  StocktakeCountEditor,
  TrackItemForm,
  WritedownForm,
} from "./inventory-client";
import {
  loadEquityAccounts,
  loadInventoryState,
  loadStocktakeDetail,
  loadStocktakesList,
  loadTransfersList,
  loadWritedownsList,
} from "./load";
import { COSTING_LABEL, type StocktakeStatus } from "./types";

const TH = "border-b border-border px-[var(--pad-x)] py-2 text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted";
const TD = "h-[var(--row-h)] border-b border-border px-[var(--pad-x)] align-middle";
const STAT =
  "flex flex-col gap-2.5 px-4 py-4 max-sm:flex-row max-sm:flex-wrap max-sm:items-baseline max-sm:justify-between max-sm:gap-x-3 max-sm:gap-y-0.5 max-sm:px-3.5 max-sm:py-2.5";
const STAT_V =
  "num-sans text-[20px] font-semibold leading-none tracking-[-0.02em] text-ink max-sm:ml-auto max-sm:text-right";

const ST_CHIP: Record<StocktakeStatus, [string, string]> = {
  open: ["chip warn", "Open"],
  confirmed: ["chip pos", "Confirmed"],
  cancelled: ["chip", "Cancelled"],
};

const NAV_TABS = [
  { key: "stock", href: "inventory", label: "Stock" },
  { key: "locations", href: "inventory/locations", label: "Locations" },
  { key: "stocktakes", href: "inventory/stocktakes", label: "Stocktakes" },
  { key: "transfers", href: "inventory/transfers", label: "Transfers" },
  { key: "writedowns", href: "inventory/writedowns", label: "Write-downs" },
  { key: "opening", href: "inventory/opening-import", label: "Opening stock" },
] as const;

function InventoryHeader({
  base,
  title,
  sub,
  active,
}: {
  base: string;
  title: string;
  sub: string;
  active: (typeof NAV_TABS)[number]["key"];
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h1 className="m-0 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">{title}</h1>
        <div className="mt-1 text-[12.5px] text-muted">{sub}</div>
      </div>
      <nav aria-label="Inventory" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {NAV_TABS.map((t) => (
          <Link
            key={t.key}
            href={`${base}/${t.href}`}
            aria-current={t.key === active ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-[12.5px] font-medium transition-colors",
              t.key === active ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink-2",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** /{slug}/inventory: Stock overview & tracked items. */
export async function StockOverviewPage({ ctx }: { ctx: OrgContext }) {
  const supabase = await createSupabaseServerClient();
  const state = await loadInventoryState(supabase, ctx.org.id);
  const base = `/${ctx.org.slug}`;
  const canEdit = ctx.role !== "viewer";
  const canAdmin = ctx.role === "owner" || ctx.role === "admin";

  return (
    <div className="flex flex-col gap-6">
      <InventoryHeader base={base} title="Stock" sub={`${ctx.org.legal_name} · What you hold, what it cost, and what it is worth`} active="stock" />

      {!state.enabled ? (
        <EnableInventoryCard orgSlug={ctx.org.slug} canAdmin={canAdmin} />
      ) : (
        <>
          <div className="card grid grid-cols-1 divide-y divide-border sm:grid-cols-4 sm:divide-x sm:divide-y-0">
            <div className={STAT}>
              <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Tracked items</div>
              <div className={STAT_V}>{state.items.length}</div>
              <div className="text-[11.5px] text-muted">Active stock items</div>
            </div>
            <div className={STAT}>
              <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Stock value</div>
              <div className={STAT_V} data-testid="inv-total-value">{rm(state.totalValueSen)}</div>
              <div className="text-[11.5px] text-muted">Carried at cost</div>
            </div>
            <div className={STAT}>
              <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Low on stock</div>
              <div className={STAT_V}>{state.lowStockCount}</div>
              <div className="text-[11.5px] text-muted">At or below reorder point</div>
            </div>
            <div className={STAT}>
              <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Locations</div>
              <div className={STAT_V}>{state.activeLocations.length}</div>
              <div className="text-[11.5px] text-muted">Active places holding stock</div>
            </div>
          </div>

          {canEdit && <TrackItemForm orgSlug={ctx.org.slug} />}

          <section className="flex flex-col gap-3">
            <h2 className="m-0 text-[14px] font-semibold text-ink">Stock items ({state.items.length})</h2>
            {state.items.length === 0 ? (
              <div className="rounded-[var(--radius-lg)] border border-dashed border-border px-4 py-10 text-center">
                <p className="m-0 text-[13.5px] font-medium text-ink">Nothing is stock-tracked yet</p>
                <p className="m-0 mt-1 text-[12.5px] text-muted">
                  Track an item above, or bring in your current shelf via{" "}
                  <Link href={`${base}/inventory/opening-import`} className="font-medium text-brand hover:underline">
                    Opening stock
                  </Link>
                  .
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
                <table className="w-full border-collapse text-[13px]" data-testid="stock-table">
                  <thead className="bg-surface">
                    <tr>
                      <th className={cn(TH, "text-left")}>Item</th>
                      <th className={cn(TH, "text-left")}>Costing</th>
                      <th className={cn(TH, "text-right")}>On hand</th>
                      <th className={cn(TH, "text-right")}>Avg unit cost</th>
                      <th className={cn(TH, "text-right")}>Value</th>
                      <th className={cn(TH, "text-right")}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.items.map((it) => (
                      <tr key={it.id} className="border-t border-border transition-colors hover:bg-surface-2">
                        <td className={cn(TD, "py-2")}>
                          <div className="flex flex-wrap items-center gap-1.5 font-medium text-ink">
                            <span>{it.name}</span>
                            {it.sku && <span className="num text-[11.5px] font-normal text-muted">{it.sku}</span>}
                            {it.isLow && (
                              <span className="chip warn" title="Available quantity is at or below the reorder point">
                                Low
                              </span>
                            )}
                          </div>
                          {it.byLocation.length > 0 && (
                            <div className="text-[11.5px] text-muted">
                              {it.byLocation.map((b) => `${b.locationName}: ${b.qty} ${it.uom}`).join(" · ")}
                            </div>
                          )}
                        </td>
                        <td className={cn(TD, "text-ink-2")}>{COSTING_LABEL[it.costingMethod]}</td>
                        <td className={cn(TD, "num whitespace-nowrap text-right text-ink")}>
                          {it.onHand} <span className="text-muted">{it.uom}</span>
                        </td>
                        <td className={cn(TD, "num-sans whitespace-nowrap text-right text-ink-2")}>{rm(it.avgCostSen)}</td>
                        <td className={cn(TD, "num-sans whitespace-nowrap text-right font-medium text-ink")}>{rm(it.valueSen)}</td>
                        <td className={cn(TD, "text-right")}>
                          {canEdit ? <EditStockItemInline orgSlug={ctx.org.slug} item={it} /> : <span className="text-muted">–</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/** /{slug}/inventory/locations */
export async function StockLocationsPage({ ctx }: { ctx: OrgContext }) {
  const supabase = await createSupabaseServerClient();
  const state = await loadInventoryState(supabase, ctx.org.id);
  const base = `/${ctx.org.slug}`;
  const canEdit = ctx.role !== "viewer";
  const canAdmin = ctx.role === "owner" || ctx.role === "admin";

  return (
    <div className="flex flex-col gap-6">
      <InventoryHeader base={base} title="Stock locations" sub="Where you hold stock. Every movement belongs to exactly one location." active="locations" />
      {!state.enabled ? (
        <EnableInventoryCard orgSlug={ctx.org.slug} canAdmin={canAdmin} />
      ) : (
        <>
          {canEdit && <AddLocationForm orgSlug={ctx.org.slug} />}
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
            <table className="w-full border-collapse text-[13px]" data-testid="locations-table">
              <thead className="bg-surface">
                <tr>
                  <th className={cn(TH, "text-left")}>Name</th>
                  <th className={cn(TH, "text-left")}>Status</th>
                  <th className={cn(TH, "text-right")}>Items held here</th>
                  <th className={cn(TH, "text-right")}>Total quantity</th>
                  <th className={cn(TH, "text-right")}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {state.locations.map((loc) => (
                  <tr key={loc.id} className="border-t border-border transition-colors hover:bg-surface-2">
                    <td className={cn(TD, "font-medium text-ink")}>{loc.name}</td>
                    <td className={TD}>
                      {loc.archivedAt ? (
                        <span className="chip">Archived</span>
                      ) : loc.isDefault ? (
                        <span className="chip brand">Default</span>
                      ) : (
                        <span className="chip pos">Active</span>
                      )}
                    </td>
                    <td className={cn(TD, "num text-right text-ink-2")}>{loc.itemCount}</td>
                    <td className={cn(TD, "num text-right text-ink")}>{loc.totalQty}</td>
                    <td className={cn(TD, "text-right")}>
                      {canEdit ? <LocationRowActions orgSlug={ctx.org.slug} loc={loc} /> : <span className="text-muted">–</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/** /{slug}/inventory/opening-import */
export async function OpeningStockPage({ ctx }: { ctx: OrgContext }) {
  const supabase = await createSupabaseServerClient();
  const [state, equityAccounts] = await Promise.all([
    loadInventoryState(supabase, ctx.org.id),
    loadEquityAccounts(supabase, ctx.org.id),
  ]);
  const base = `/${ctx.org.slug}`;
  const canAdmin = ctx.role === "owner" || ctx.role === "admin";

  return (
    <div className="flex flex-col gap-6">
      <InventoryHeader base={base} title="Opening stock" sub="Bring in what you already hold on the day you start, from a spreadsheet." active="opening" />
      {!state.enabled ? (
        <EnableInventoryCard orgSlug={ctx.org.slug} canAdmin={canAdmin} />
      ) : (
        <OpeningStockImporter
          orgSlug={ctx.org.slug}
          today={state.today}
          locations={state.activeLocations}
          equityAccounts={equityAccounts}
          existingItems={state.items.map((i) => i.name)}
        />
      )}
    </div>
  );
}

/** /{slug}/inventory/transfers */
export async function StockTransfersPage({ ctx }: { ctx: OrgContext }) {
  const supabase = await createSupabaseServerClient();
  const [state, transfers] = await Promise.all([
    loadInventoryState(supabase, ctx.org.id),
    loadTransfersList(supabase, ctx.org.id),
  ]);
  const base = `/${ctx.org.slug}`;
  const canEdit = ctx.role !== "viewer";
  const canAdmin = ctx.role === "owner" || ctx.role === "admin";

  return (
    <div className="flex flex-col gap-6">
      <InventoryHeader base={base} title="Stock transfers" sub="Move quantity between locations. A transfer never changes what your stock is worth." active="transfers" />
      {!state.enabled ? (
        <EnableInventoryCard orgSlug={ctx.org.slug} canAdmin={canAdmin} />
      ) : (
        <>
          {canEdit &&
            (state.activeLocations.length < 2 ? (
              <div className="rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-3 text-[12.5px] text-muted">
                You need two stock locations before you can transfer between them.{" "}
                <Link href={`${base}/inventory/locations`} className="font-medium text-brand hover:underline">
                  Add a location
                </Link>
              </div>
            ) : state.items.length === 0 ? (
              <div className="rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-3 text-[12.5px] text-muted">
                Track at least one item before recording a transfer.
              </div>
            ) : (
              <StockTransferForm orgSlug={ctx.org.slug} today={state.today} locations={state.activeLocations} items={state.items} />
            ))}

          <section className="flex flex-col gap-3">
            <h2 className="m-0 text-[14px] font-semibold text-ink">Transfers ({transfers.length})</h2>
            {transfers.length === 0 ? (
              <div className="rounded-[var(--radius-lg)] border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted">
                No transfer yet. Record one when stock physically moves between your locations.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
                <table className="w-full border-collapse text-[13px]" data-testid="stock-transfers-table">
                  <thead className="bg-surface">
                    <tr>
                      <th className={cn(TH, "text-left")}>Date</th>
                      <th className={cn(TH, "text-left")}>From</th>
                      <th className={cn(TH, "text-left")}>To</th>
                      <th className={cn(TH, "text-right")}>Lines</th>
                      <th className={cn(TH, "text-left")}>Memo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transfers.map((t) => (
                      <tr key={t.id} className="border-t border-border transition-colors hover:bg-surface-2">
                        <td className={cn(TD, "num text-ink")}>{t.occurredOn}</td>
                        <td className={cn(TD, "text-ink")}>{t.fromName}</td>
                        <td className={cn(TD, "text-ink")}>{t.toName}</td>
                        <td className={cn(TD, "num text-right text-ink-2")}>{t.lineCount}</td>
                        <td className={cn(TD, "text-ink-2")}>{t.memo ?? "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/** /{slug}/inventory/stocktakes */
export async function StocktakesListPage({ ctx }: { ctx: OrgContext }) {
  const supabase = await createSupabaseServerClient();
  const [state, list] = await Promise.all([
    loadInventoryState(supabase, ctx.org.id),
    loadStocktakesList(supabase, ctx.org.id),
  ]);
  const base = `/${ctx.org.slug}`;
  const canEdit = ctx.role !== "viewer";
  const canAdmin = ctx.role === "owner" || ctx.role === "admin";

  return (
    <div className="flex flex-col gap-6">
      <InventoryHeader base={base} title="Stocktakes" sub="Count what is on the shelf, then let Kira book the difference." active="stocktakes" />
      {!state.enabled ? (
        <EnableInventoryCard orgSlug={ctx.org.slug} canAdmin={canAdmin} />
      ) : (
        <>
          {canEdit && state.activeLocations.length > 0 && (
            <OpenStocktakeForm orgSlug={ctx.org.slug} today={state.today} locations={state.activeLocations} />
          )}
          <section className="flex flex-col gap-3">
            <h2 className="m-0 text-[14px] font-semibold text-ink">Stocktakes ({list.length})</h2>
            {list.length === 0 ? (
              <div className="rounded-[var(--radius-lg)] border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted">
                No stocktake yet. Open one for a location to start counting.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
                <table className="w-full border-collapse text-[13px]" data-testid="stocktakes-table">
                  <thead className="bg-surface">
                    <tr>
                      <th className={cn(TH, "text-left")}>Opened on</th>
                      <th className={cn(TH, "text-left")}>Location</th>
                      <th className={cn(TH, "text-left")}>Counted lines</th>
                      <th className={cn(TH, "text-left")}>Status</th>
                      <th className={cn(TH, "text-right")}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((s) => {
                      const [chip, label] = ST_CHIP[s.status];
                      return (
                        <tr key={s.id} className="border-t border-border transition-colors hover:bg-surface-2">
                          <td className={cn(TD, "num text-ink")}>{s.openedOn}</td>
                          <td className={cn(TD, "py-2")}>
                            <div className="font-medium text-ink">{s.locationName}</div>
                            {s.memo && <div className="text-[11.5px] text-muted">{s.memo}</div>}
                          </td>
                          <td className={cn(TD, "num text-ink-2")}>{s.countedCount} / {s.lineCount}</td>
                          <td className={TD}><span className={chip}>{label}</span></td>
                          <td className={cn(TD, "text-right")}>
                            <Link href={`${base}/inventory/stocktakes/${s.id}`} className="font-medium text-brand hover:underline">
                              Open
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/** /{slug}/inventory/stocktakes/[id] */
export async function StocktakeDetailPage({ ctx, id }: { ctx: OrgContext; id: string }) {
  const supabase = await createSupabaseServerClient();
  const st = await loadStocktakeDetail(supabase, ctx.org.id, id);
  if (!st) notFound();
  const base = `/${ctx.org.slug}`;
  const canEdit = ctx.role !== "viewer";
  const [chip, label] = ST_CHIP[st.status];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`${base}/inventory/stocktakes`} className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-ink">
          <ArrowLeft size={13} aria-hidden="true" /> Stocktakes
        </Link>
        <h1 className="m-0 mt-2 flex flex-wrap items-center gap-2 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">
          <span>Stocktake · {st.locationName}</span>
          <span className={chip} data-testid="stocktake-status">{label}</span>
        </h1>
        <div className="mt-1 text-[12.5px] text-muted">
          Opened <span className="num text-ink">{st.openedOn}</span>
          {st.memo ? ` · ${st.memo}` : ""}
          {st.journalEntryId && (
            <>
              {" · "}
              <Link href={`${base}/ledger/entries/${st.journalEntryId}`} className="font-medium text-brand hover:underline">
                View variance journal
              </Link>
            </>
          )}
        </div>
      </div>

      {st.status === "open" ? (
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-3 text-[12.5px] text-ink-2">
          While this stocktake is open, stock cannot move at {st.locationName}. Confirm or cancel it to unfreeze.
        </div>
      ) : (
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-3 text-[12.5px] text-muted">
          This stocktake is closed, so it is shown as it was left.
        </div>
      )}

      <StocktakeCountEditor
        orgSlug={ctx.org.slug}
        stocktakeId={st.id}
        lines={st.lines}
        isOpen={st.status === "open"}
        canEdit={canEdit}
      />
    </div>
  );
}

/** /{slug}/inventory/writedowns */
export async function StockWritedownsPage({ ctx }: { ctx: OrgContext }) {
  const supabase = await createSupabaseServerClient();
  const [state, list] = await Promise.all([
    loadInventoryState(supabase, ctx.org.id),
    loadWritedownsList(supabase, ctx.org.id),
  ]);
  const base = `/${ctx.org.slug}`;
  const canEdit = ctx.role !== "viewer";
  const canAdmin = ctx.role === "owner" || ctx.role === "admin";
  const valuedItems = state.items.filter((i) => i.valueSen > 0);

  return (
    <div className="flex flex-col gap-6">
      <InventoryHeader
        base={base}
        title="Write-downs"
        sub="Lower what an item is carried at when it will not sell for what it cost. The quantity stays as it is."
        active="writedowns"
      />
      {!state.enabled ? (
        <EnableInventoryCard orgSlug={ctx.org.slug} canAdmin={canAdmin} />
      ) : (
        <>
          {canEdit &&
            (valuedItems.length === 0 ? (
              <div className="rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-3 text-[12.5px] text-muted">
                Track an item with carrying value before recording a write-down.
              </div>
            ) : (
              <WritedownForm orgSlug={ctx.org.slug} today={state.today} items={valuedItems} />
            ))}

          <section className="flex flex-col gap-3">
            <h2 className="m-0 text-[14px] font-semibold text-ink">Write-downs ({list.length})</h2>
            {list.length === 0 ? (
              <div className="rounded-[var(--radius-lg)] border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted">
                No write-down yet. Record one when stock is damaged, expired, or worth less than it cost.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
                <table className="w-full border-collapse text-[13px]" data-testid="writedowns-table">
                  <thead className="bg-surface">
                    <tr>
                      <th className={cn(TH, "text-left")}>Date</th>
                      <th className={cn(TH, "text-left")}>Item &amp; reason</th>
                      <th className={cn(TH, "text-right")}>Value before</th>
                      <th className={cn(TH, "text-right")}>Write-down</th>
                      <th className={cn(TH, "text-right")}>Value after</th>
                      <th className={cn(TH, "text-right")}>Ledger</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((w) => (
                      <tr key={w.id} className="border-t border-border transition-colors hover:bg-surface-2">
                        <td className={cn(TD, "num whitespace-nowrap text-ink")}>{w.occurredOn}</td>
                        <td className={cn(TD, "py-2")}>
                          <div className="font-medium text-ink">{w.itemName}</div>
                          <div className="text-[11.5px] text-muted">{w.reason}</div>
                        </td>
                        <td className={cn(TD, "num-sans whitespace-nowrap text-right text-ink-2")}>{rm(w.valueBeforeSen)}</td>
                        <td className={cn(TD, "num-sans whitespace-nowrap text-right font-medium text-negative")}>−{rm(w.amountSen)}</td>
                        <td className={cn(TD, "num-sans whitespace-nowrap text-right font-medium text-ink")}>{rm(w.valueAfterSen)}</td>
                        <td className={cn(TD, "whitespace-nowrap text-right")}>
                          <Link href={`${base}/ledger/entries/${w.journalEntryId}`} className="font-medium text-brand hover:underline">
                            View entry
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
