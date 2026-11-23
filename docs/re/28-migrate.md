# Slice 28: Migrate (Opening balances)

Reverse engineered from lejar.ai on 2026-11-23, read-only.
- Extracted the `"migrating-to-lejar"` help article (`appPath: "/migrate"`) from Lejar's help chunk (`0-eyswk7vufsj.js`) and `pageTitle.migrate.*`, `chat.completion.opening_balance`, and `chat.actionOffer.moveSystem.role` keys from `0sbs3p0t4lr74.js`.

Legend: **Observed** · **Inferred** · **Assumed** (Kira's choice).

## Observed on Lejar (i18n bundle + help article)

- **Route & Title:** `/{slug}/migrate` — `Bring your books across` (BM: `Pindahkan buku anda`), nav label `Migrate` (`Pindahkan buku`) under **Bring in**.
- **Sources:**
  - **CSV / Excel** (for SQL Account, AutoCount, MYOB, Bukku, QuickBooks, or a spreadsheet — download template, fill in closing balances as at the day before cutover, upload).
  - **Xero** (Trial Balance CSV export).
  - **Sage UBS** (Trial Balance CSV/TSV text export).
- **Accounting rules:**
  - Balances as at the day before cutover are mapped to Kira accounts (with auto-suggested matches), checked for balance (`Debits === Credits`), and committed as one opening journal entry on the cutover date (must fall inside an open accounting period).
  - Asset, liability, and equity balances become opening lines; prior year-to-date revenue and expense balances fold into Retained Earnings (`section = 'retained_earnings'`: `100-0400` for Sdn Bhd, `100-0200` for sole prop, `100-0300` for partnership/LLP).
  - **Permission:** Owner or Admin only (`"An owner or admin can open Migrate"`).

## Kira's build

- **Routes & Wiring:**
  - `src/app/[org]/migrate/page.tsx` (`MigratePage`).
  - Added `"migrate"` to `BUILT_PATHS` in `src/shared/shell/nav.ts` (completing 100% of the **Bring in** sidebar group).
  - Added `'opening_balance'` to `SOURCE_LABEL` and `sourceHref` in `src/features/ledger/load.ts`.
- **Feature module (`src/features/migrate/`):**
  - `types.ts`, `parse-tb.ts` (RFC-4180 CSV/TSV parser handling Xero/Sage UBS multi-line report headers, `RM`/parentheses formatting, `Total` row skipping, and Malaysian MPERS alias auto-matching), `load.ts`, `actions.ts`, `migrate-client.tsx`, `migrate-page.tsx`.
  - Includes a downloadable CSV template (`kira-opening-balances-template.csv`), direct **Manual entry** option, live balance/unmapped check, live P&L fold-in preview, and a Migration history table with two-step `Reverse` and Ledger links.
  - **Assumed:** Opening balances trial balance import only (Aged Receivables / Aged Payables sub-ledger open-item import and foreign-currency migration are deferred).
- **Database (`supabase/migrations/20261122002600_migrate.sql`):**
  - Widened `journal_entries_source_check` with `'opening_balance'`.
  - Added `opening_migrations` with RLS member read policy.
  - Added owner/admin-only RPCs `commit_opening_balances` (folds YTD `revenue`/`expense` into `section = 'retained_earnings'` when enabled, verifies balance, inserts one `opening_balance` journal entry, logs `migration.committed` to `org_activity_log`) and `reverse_opening_migration` (posts balancing reversal entry, links `reversed_by`/`reversal_of`, logs `migration.reversed`).

## Verified (2026-11-23, real Supabase project, temporary user deleted afterwards)

- **Playwright E2E:**
  - Uploaded a 6-row Xero Trial Balance CSV (with 2 title lines, `Account Code,Account,Debit - Year to date,Credit - Year to date`, and `Total` row) → verified all 6 accounts auto-matched (`Maybank Current` → `300-0900`, `Trade Debtors` → `300-0200`, `Trade Creditors` → `400-0100`, `Share Capital` → `100-0100`, `Sales` → `600-0100`, `Rental` → `800-0800`).
  - Verified live balance (`Balanced`, `RM41,000.00`) and P&L fold preview (`2 prior P&L lines will fold into 100-0400 · Retained Earnings as a net credit of RM12,000.00`).
  - Committed → confirmed 5-line opening entry (`RM35,000.00`) with `100-0400 Retained Earnings` credit `RM12,000.00` in Ledger.
  - Committed a 2-line manual opening entry (`RM1,000.00`), reversed it (`Reversed` chip + `Reversal` link), and verified Trial Balance balanced at exact `RM35,000.00`.
- **Interactive clicking/hovering browser audit:** Verified sidebar nav under `Bring in`, help disclosure, all 4 source cards, live unbalanced → balanced validation, inline `Reverse` cancel, and Ledger opening entry verification with 0 console errors and 0 HTTP `>= 400` responses; compacted Migration history to 5 columns and shortened the Notes placeholder to eliminate narrow-viewport overflow.
