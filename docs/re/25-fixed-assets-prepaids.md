# Slice 25: Fixed assets & Prepaid amortisation

Reverse engineered from lejar.ai on 2026-11-23, read-only.
- Extracted the in-app help articles `"fixed-assets"` and `"prepaid-amortisations"` from Lejar's help chunk (`0-eyswk7vufsj.js`) and all asset / depreciation / disposal / prepaid amortisation i18n keys (`prepaid.status.posted`, `status.fullyDepreciated`, `status.disposed`, etc.) from `0sbs3p0t4lr74.js`.

Legend: **Observed** · **Inferred** · **Assumed** (Kira's choice).

## Observed on Lejar (i18n bundle + help articles)

- **Fixed assets (`/{slug}/fixed-assets` and `/{slug}/fixed-assets/[id]`):** Register for equipment, vehicles, furniture, and property with straight-line monthly depreciation and asset disposal.
  - Register form: `Asset name`, `Asset code` (auto `FA-001` if blank), `Asset account` (`200-0100`..`200-0500`), paired `Accumulated depreciation` contra account (`200-0105`..`200-0505`), `Depreciation expense` (`800-2400` / `800-2300`), `Purchase date`, `Depreciate from`, `Cost (RM)`, `Residual (RM)`, `Life (months)`, live straight-line `/ month` preview.
  - **Run depreciation:** Evaluates active assets through a chosen month-end (`month_end(as_of)`), posting one balanced journal entry (`Dr Depreciation expense`, `Cr Accumulated depreciation`) per unposted month without double-posting (`unique (asset_id, period_month)`). The final depreciable month absorbs any rounding remainder (`(cost - residual) - accum_dep`) and automatically retires the asset to `Fully depreciated`. Closed accounting periods are skipped gracefully.
  - **Dispose asset:** Available on active or fully depreciated assets on the detail page. Clears asset cost (`Cr Asset account`) and accumulated depreciation (`Dr Accumulated depreciation`), posts any cash proceeds (`Dr Cash/Bank account`), and recognises gain or loss on disposal to `900-0400` (`Gain on Disposal of Assets`). Marks the asset `Disposed` with a link to the disposal ledger entry.
  - Statuses: `Active`, `Fully depreciated`, `Disposed`.
- **Prepaid amortisation (`/{slug}/prepaid-amortisations` and `/{slug}/prepaid-amortisations/[id]`):** Spread upfront costs (insurance, rent, annual software subscriptions) from `300-0500 Prepayments` into an expense account across `2..120` months.
  - Schedule setup: `Schedule name`, `Prepaid asset account` (`300-0500`), `Expense account`, `Total prepaid amount (RM)`, `Periods (months)`, `First month`, `Auto-post due periods` toggle, live `Per month` preview.
  - Period lines are pre-generated at month-end dates; the final period absorbs any rounding remainder so the schedule sums exactly to the total prepaid amount.
  - **Posting:** Either batch-post due periods for schedules with `auto_post = true` (`Post due now`), or post individual periods on the schedule detail page (`Post`). Each posted period creates a balanced journal entry (`Dr Expense account`, `Cr Prepaid asset account`) and links to the ledger entry. Posting the last pending period marks the schedule `Completed`.
  - **Cancel remaining periods:** Cancels all remaining `Pending` lines and marks the schedule `Cancelled`, preserving already-posted periods and their ledger entries.
  - Statuses: Schedule (`Active`, `Completed`, `Cancelled`); Period line (`Pending`, `Posted`, `Cancelled`).

## Kira's build

- **Routes:**
  - `src/app/[org]/fixed-assets/page.tsx` (`FixedAssetsListPage`) and `src/app/[org]/fixed-assets/[id]/page.tsx` (`FixedAssetDetailPage`).
  - `src/app/[org]/prepaid-amortisations/page.tsx` (`PrepaidsListPage`) and `src/app/[org]/prepaid-amortisations/[id]/page.tsx` (`PrepaidDetailPage`).
  - Added `"fixed-assets"` and `"prepaid-amortisations"` to `BUILT_PATHS` in `src/shared/shell/nav.ts` (completing 100% of the **Accounting** sidebar group).
- **Feature modules:**
  - `src/features/fixed-assets/` (`types.ts`, `load.ts`, `actions.ts`, `fixed-assets-client.tsx`, `fixed-assets-page.tsx`).
  - `src/features/prepaids/` (`types.ts`, `load.ts`, `actions.ts`, `prepaids-client.tsx`, `prepaids-page.tsx`).
  - Updated `src/features/ledger/load.ts` (`SOURCE_LABEL`, `sourceHref`), `src/features/books/doc-info.ts`, and `src/app/[org]/ledger/entries/[id]/page.tsx` so `depreciation`, `disposal`, and `amortisation` entries display `Asset` / `Schedule` labels and link back to their asset or prepaid schedule.
  - Hardened `Select` in `src/shared/ui/form-controls.tsx` (`min-w-0 truncate whitespace-nowrap`) and grid cells in `fixed-assets-client.tsx` so long MPERS account names never overflow narrow columns.
- **Database (`supabase/migrations/20261122002300_fixed_assets_prepaids.sql`):**
  - Widened `journal_entries_source_check` with `'depreciation'`, `'disposal'`, and `'amortisation'`.
  - Added `public.month_end(date)`, `fixed_assets`, `depreciation_runs`, `prepaid_schedules`, `prepaid_schedule_lines` with RLS read policies.
  - Added RPCs: `create_fixed_asset`, `run_depreciation`, `dispose_fixed_asset`, `create_prepaid_schedule`, `post_prepaid_line`, `post_due_prepaids`, and `cancel_prepaid_schedule`.
  - **Assumed:** Straight-line depreciation only (no reducing-balance or unit-of-production methods yet); auto-post schedules are triggered explicitly via "Post due now" rather than a background cron job.

## Verified (2026-11-23, real Supabase project, temporary user deleted afterwards)

- **Fixed assets:**
  - Registered `FA-001` (`Laptop`, `200-0300` / auto-paired `200-0305`, `RM1,000.00`, `RM0` residual, `3` months, `2026-09-01`) → ran depreciation through `2026-11-30` → posted 3 entries (`RM333.33 + RM333.33 + RM333.34 = RM1,000.00`, final month absorbed rounding), auto-retired to `Fully depreciated` (`NBV RM0.00`). Re-running posted `0 entries (RM0.00)` (idempotent).
  - Registered `FA-002` (`Office Desk`, switching Asset account to `200-0200` auto-paired `200-0205`, `RM600.00`, `12` months, `2026-11-01`) → posted 1 month (`RM50.00`, `NBV RM550.00`) → disposed on `2026-11-23` for `RM600.00` into `300-0900` → status moved to `Disposed` with disposal entry recognising `RM50.00` gain on `900-0400`.
- **Prepaid amortisation:**
  - Created auto-post schedule `"Annual software"` (`300-0500` → `800-1300`, `RM100.00`, `3` periods from `2026-10-01`) → clicked `"Post due now"` through `2026-11-30` → posted 2 periods (`RM66.66`) → verified Period 3 on detail page absorbed rounding (`RM33.34`) → clicked `"Post"` → schedule moved to `Completed` (`3 / 3`, remaining `RM0.00`).
  - Created manual schedule `"Office insurance"` (`300-0500` → `800-1100`, `RM1,200.00`, `12` periods) → posted Period 1 (`RM100.00`) → clicked `"Cancel remaining periods"` → schedule moved to `Cancelled` (Periods 2–12 cancelled).
- **Trial Balance:** Balanced at `RM1,850.00` debits = `RM1,850.00` credits across all depreciation, disposal, and amortisation journals.
- **Interactive clicking/hovering browser audit:** Verified Accounting sidebar expansion, help toggles, auto-pairing across `200-0200`/`200-0300`/`200-0400`, live monthly previews (`RM100.00 / month`), hover states, detail pages, and linked Ledger entries with 0 console errors and 0 HTTP `>= 400` responses; fixed the two UI polish findings (narrow-viewport `<select>` truncation and `Asset`/`Schedule` party label on Ledger entry detail) and verified clean production rebuild.
