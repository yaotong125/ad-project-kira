# Slice 30: Inventory (Stock, Locations, Stocktakes, Transfers, Write-downs, Opening stock)

Reverse engineered from lejar.ai on 2026-11-23, read-only.
- Extracted the `"saved-items-and-stock"` help article from Lejar's help chunk (`0-eyswk7vufsj.js`) and all `inventory.ui.*`, `inventory.reports.*`, and `inventory.accounts.*` keys from `0sbs3p0t4lr74.js`.

Legend: **Observed** · **Inferred** · **Assumed** (Kira's choice).

## Observed on Lejar (i18n bundle + help article)

- **Enable step (`Turn on stock tracking`):** Links/adds Stock (`300-0100`), Cost of Goods Sold (`700-0100`), and Stock Adjustments and Write-downs (`700-0400`) to the chart of accounts.
- **6 Sidebar Routes under Inventory:**
  1. **Stock (`/{slug}/inventory`):** KPI strip (`Tracked items`, `Stock value`, `Low on stock`, `Locations`), `Track an item` form (name, SKU, unit of measure, costing method `FIFO` or `Moving weighted average` — locked once an item has movements, optional reorder point/quantity), stock items register with per-location breakdown, average unit cost, carrying value, `Low` badge, and inline `Edit`.
  2. **Stock locations (`/{slug}/inventory/locations`):** `Add a location`, `Make default`, `Archive` (refused if any stock is held at that location or an open stocktake freezes it).
  3. **Stocktakes (`/{slug}/inventory/stocktakes` and `/[id]`):** Opening a stocktake snapshots book quantities and freezes stock movements at that location; save counted quantities, review live variances, and `Confirm stocktake` (books variance movements + balanced ledger journal) or `Cancel stocktake` to unfreeze.
  4. **Stock transfers (`/{slug}/inventory/transfers`):** Multi-line transfers between two different active locations; verifies available quantity at source and preserves total stock carrying value.
  5. **Write-downs (`/{slug}/inventory/writedowns`):** Lowers carrying value of damaged/expired stock without changing quantity (`<= carrying value`), posting `Dr 700-0400 Stock Adjustments and Write-downs, Cr 300-0100 Inventory`.
  6. **Opening stock (`/{slug}/inventory/opening-import`):** Spreadsheet/CSV importer (`item,quantity,unit_cost,location,uom,costing_method`) with downloadable sample CSV, `Validate (dry run)`, and `Import` creating new items, opening movements, and one balanced opening stock journal (`Dr 300-0100, Cr Equity counter account`).

## Kira's build

- **Routes & Wiring:**
  - `src/app/[org]/inventory/page.tsx`, `locations/page.tsx`, `stocktakes/page.tsx`, `stocktakes/[id]/page.tsx`, `transfers/page.tsx`, `writedowns/page.tsx`, `opening-import/page.tsx`.
  - Added `"inventory"` to `BUILT_PATHS` in `src/shared/shell/nav.ts` (**100% of all sidebar groups are now built!**) and `'inventory'` to `SOURCE_LABEL` / `sourceHref` in `src/features/ledger/load.ts`.
- **Feature module (`src/features/inventory/`):**
  - `types.ts`, `load.ts`, `actions.ts`, `inventory-client.tsx`, `inventory-pages.tsx`.
  - **Assumed:** Stock items are tracked directly inside Inventory without requiring a separate Price Book first; opening stock, stocktake variances, and write-downs post balanced `'inventory'` ledger journals directly rather than queuing derived proposals in AI Inbox.
- **Database (`supabase/migrations/20261122002800_inventory.sql`):**
  - Widened `journal_entries_source_check` with `'inventory'` and added `organizations.inventory_enabled`.
  - Added 7 tables (`inventory_locations`, `inventory_items`, `inventory_movements`, `inventory_stocktakes`, `inventory_stocktake_lines`, `inventory_transfers`, `inventory_writedowns`) with RLS read policies and one-open-stocktake-per-location unique index.
  - Added 13 RPCs (`enable_inventory`, location CRUD, item CRUD with costing lock after first movement, `import_opening_stock`, `record_stock_transfer`, `open_stocktake`, `save_stocktake_counts`, `confirm_stocktake`, `cancel_stocktake`, `record_stock_writedown`).

## Verified (2026-11-23, real Supabase project, temporary user deleted afterwards)

- **Playwright E2E:**
  - Enabled stock tracking → created `700-0400` and default `Main store`.
  - Validated (dry run) and imported opening stock (`40 × RM35.00` Arabica Coffee Beans + `60 × RM8.50` Oat Milk = `RM1,910.00`) → verified opening journal posted.
  - Added `Warehouse A` and confirmed archiving non-empty `Main store` is refused.
  - Transferred `10` bags of Arabica from `Main store` to `Warehouse A` → total carrying value remained `RM1,910.00`.
  - Opened & confirmed a `Main store` stocktake (`30 → 28` Arabica = `-2` bags = `-RM70.00` shortage) → linked variance journal created.
  - Recorded a `RM60.00` write-down on `Oat Milk 1L` (`RM510.00 → RM450.00`, quantity unchanged at `60` cartons).
  - **Ledger tie-out:** Stock overview (`RM1,780.00`) tied out to the exact sen with Trial Balance (`300-0100 Inventory RM1,780.00` + `700-0400 Stock Adjustments and Write-downs RM130.00` Dr = `100-0400 Retained Earnings RM1,910.00` Cr).
- **Interactive clicking/hovering browser audit:** Verified all 6 Inventory pages (`Stock`, `Locations`, `Stocktakes` + detail, `Transfers`, `Write-downs` + Ledger entry, `Opening stock` dry run), hover states, inline item edit with locked costing method, 0 console errors, and 0 HTTP `>= 400` responses; fixed `<Select>` chevron clipping, aligned single-line Transfer width, added `whitespace-nowrap` on write-down dates/links, and cleared the unused-var lint warning.
