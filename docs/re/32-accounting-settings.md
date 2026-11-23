# Slice 32 — Accounting Settings Sub-tabs (Document numbering, Price book, Exchange rates)

Reverse engineered from Lejar.ai's Settings → Accounting sub-tabs (`saved-items-and-stock`, `invoice-appearance`, and FX transfer conventions in `0-eyswk7vufsj.js` and `0sbs3p0t4lr74.js`).

Completes all 4 sub-tabs under **Settings → Accounting**, eliminating every remaining "coming soon" sub-tab in Settings.

## 1. Routes

| Route | Sub-tab | Purpose |
|---|---|---|
| `/{slug}/settings/document-numbering` | **Numbering** | Configure prefix, pattern (`{PREFIX}-{YYYY}{MM}-{SEQ}`, `{PREFIX}-{YYYY}-{SEQ}`, `{PREFIX}-{SEQ}`), digit padding (`2`–`6`), and next sequence number across all 11 document series (`Sales invoice`, `Quick invoice`, `Quote`, `Delivery order`, `Credit note`, `Debit note`, `Refund note`, `Supplier bill`, `Official receipt`, `Payment voucher`, `Bank transfer`) with live formatted previews (e.g. `KINV-2026-0015`). |
| `/{slug}/settings/price-book` | **Price book** | Maintain reusable catalog items (Name, SKU, Category: `Service`/`Product`/`Digital`/`Other`, Default price RM, SST treatment, MPERS Revenue account, Default line description) with search, category filter, inline edit, archive/restore, delete, and a direct cross-link to Inventory stock tracking. |
| `/{slug}/settings/exchange-rates` | **Exchange rates** | Record MYR-per-1-foreign-unit rates (`USD`, `SGD`, `EUR`, `GBP`, `AUD`, `CNY`, `JPY`, `THB`, `IDR`, `HKD`, `INR`, `PHP`) by date and source (`Bank`, `BNM`, `Manual`) with instant reciprocal conversion preview, latest-rate summary cards, and full rate history. |

## 2. Database Schema & RPCs (`supabase/migrations/20261123003000_accounting_settings_subtabs.sql`)

- **Tables added (RLS: `public.is_org_member(org_id)` read; mutations strictly via `security definer` RPCs):**
  - `org_document_numbering` (`org_id`, `doc_type`, `prefix`, `pattern`, `pad_width`, `next_number`)
  - `price_book_items` (`org_id`, `name`, `sku`, `category`, `description`, `unit_price_cents`, `tax_code`, `revenue_account_id`, `active`)
  - `exchange_rates` (`org_id`, `currency_code`, `rate_date`, `rate`, `source`, `note`)
- **RPCs (`security definer`, `set search_path = public`):**
  - `upsert_document_numbering` (Owner / Admin via `org_for_admin`)
  - `create_price_book_item`, `update_price_book_item`, `toggle_price_book_item`, `delete_price_book_item` (Owner / Admin / Bookkeeper via `learn_org_for_editor`)
  - `upsert_exchange_rate`, `delete_exchange_rate` (Owner / Admin / Bookkeeper via `learn_org_for_editor`)
- All mutations write audit records to `org_activity_log`.

## 3. Code Layout

- Feature module: `src/features/accounting-settings/`
  - `types.ts` — `DOC_SERIES_DEFAULTS`, `NUMBERING_PATTERNS`, `formatNumberingPreview`, `PRICE_BOOK_CATEGORIES`, `PRICE_BOOK_TAX_CODES`, `COMMON_CURRENCIES`
  - `load.ts` — Server loaders for numbering rules, price book items + active MPERS `revenue` accounts, and exchange rate history
  - `actions.ts` — Server Actions wrapping all 7 SQL RPCs
  - `sub-tabs.tsx` — Shared `AccountingSettingsHeader` reused by `control-accounts-page.tsx` and all 3 new sub-tabs
  - `accounting-client.tsx` — Interactive forms, tables, search/filter, inline edit, and live FX conversion preview
  - `accounting-pages.tsx` — Server page wrappers (`DocumentNumberingPage`, `PriceBookPage`, `ExchangeRatesPage`)
- App Router pages:
  - `src/app/[org]/settings/document-numbering/page.tsx`
  - `src/app/[org]/settings/price-book/page.tsx`
  - `src/app/[org]/settings/exchange-rates/page.tsx`

## 4. Verification

- `npx tsc --noEmit`, `npm run lint`, and `npx next build` passed with zero errors and zero warnings across all **91 routes**.
- End-to-end Playwright test (`scratch/e2e32.js`) verified:
  - Updating `Sales invoice` numbering to `KINV`, `{PREFIX}-{YYYY}-{SEQ}`, `4 digits`, next `#15` → live preview `KINV-2026-0015` persisted across reload.
  - Creating `Monthly Bookkeeping Retainer` (`RET-01`, RM 1,500.00, Service Tax 8%) and `Arabica Coffee Beans 1kg` (`COF-1K`, RM 48.00 → edited inline to RM 52.00, archived & restored, linked to `600-0000 · Revenue`).
  - Recording `USD` (`RM 4.4500`, Bank) and `SGD` (`RM 3.3125`, BNM), plus creating and deleting `EUR` (`RM 4.8200`).
- Interactive browser click/hover audit confirmed all **4 Accounting sub-tabs** are live with zero "coming soon" placeholders, centered `<select>` typography, `0` console errors, and `0` HTTP `>= 400` responses.
