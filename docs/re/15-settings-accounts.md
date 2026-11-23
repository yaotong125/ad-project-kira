# Slice 15: Settings (Business Profile) & Chart of Accounts

Reverse engineered from lejar.ai on 2026-11-22, read-only.
- Captured Lejar's `/{slug}/settings/profile` (`c0-settings-profile.html`) and `/{slug}/accounts` (`c1-accounts.html`) on the user's test entity Kira Test Sdn Bhd via the signed-in debugging Chrome (`http://127.0.0.1:9222`, REA target discovery Evidence `ev_19672b4b8ad5dc45b1e6f70058168ed8b854d877ef760a755728275492462c55`).
- All form fields, helper texts, section options, and table actions were observed from the rendered HTML; server-side validation and error messages are inferred/Kira's design (no forms were submitted on the user's Lejar account).

Legend: **Observed** · **Inferred** · **Assumed** (Kira's choice).

## Observed on Lejar

### Settings (`/{slug}/settings/profile`)
- **Header:** `Settings`, subtitle `Workspace · {legal_name}`.
- **Sub-navigation bar (`aria-label="Settings"`):** 7 horizontal tabs — `Profile` (`/settings/profile`), `Team & activity` (`/settings/team`), `Accounting` (`/settings/control-accounts`), `Tax & e-Invois` (`/settings/sst`), `API & webhooks` (`/settings/api-keys`), `Data & AI` (`/settings/data`), `Account & security` (`/settings/account`).
- **Entity profile section (Owner-only):**
  - `Invoice logo` upload (`image/png,image/jpeg`, up to 2 MB, shown on invoice PDFs) and `Payment QR` upload (`DuitNow, TNG or your bank's QR`, up to 2 MB, shown on quick-invoice PDFs).
  - Legal name*, SSM number, SST number, Registration type (`Business (SSM / BRN)`, `Individual, NRIC (MyKad)`, `Individual, Passport`, `Individual, Army`), LHDN TIN.
  - Business address (shown on invoices): Address textarea (max 500), Postcode, City, State (16 Malaysian states & federal territories).
  - Default pricing: `Exclude SST` (`exclusive`) / `Include SST` (`inclusive`) — applied to new sales invoices.
  - e-Invoice (MyInvois): Phone number (8–20 digits, optional `+`), MSIC code (5 digits), Business activity, Default classification code (LHDN codes `001`–`045`), e-Invoice mandate start (`min="2024-08-01"`, plus LHDN's 5 turnover phase dates).
  - Payment details (shown on invoices): Bank, Account name, Account number, DuitNow ID, Payment note.
  - Save button with `"Owner-only. Changes apply immediately."`
- **Fixed at bootstrap section:** `<dl>` showing `Slug`, `Business type`, `Fiscal year-end`, `Accounting standard` (`MPERS`).
- **Fiscal year-end section:** `New fiscal year-end*`, `Commencement date` (optional, up to 18 months for a long first year), `Change fiscal year-end` button — regenerates accounting periods only before any transaction is posted and while no period is closed.

### Chart of accounts (`/{slug}/accounts`)
- **Header:** `Chart of accounts`, subtitle `{legal_name} · MPERS-aligned · {count} accounts` (dotted-underline `MPERS` hint), `"Learn about this page"` help toggle.
- **Add forms (collapsible):**
  - `New account`: Code*, Name*, Type (`Asset`, `Liability`, `Equity`, `Revenue`, `Expense`, `Contra asset`, `Contra liability`), conditional Subtype (`Current`, `Non-current`, `Bank or cash account` for Asset) with MPERS classification helper.
  - `New fixed-asset account`: Fixed-asset class name* — creates the asset account plus its paired `Accumulated Depreciation - {name}` account under Property, Plant and Equipment.
- **7 collapsible account groups:** `Assets`, `Contra assets`, `Liabilities`, `Contra liabilities`, `Equity`, `Revenue`, `Expenses`.
- **Table columns:** `Code` (with inline `Edit`, child accounts prefixed with `↳`), `Name` (with inline `Edit`), `Subtype` (`Current` / `Non-current` / `Cash / bank` / `–`), `Section` (inline `<select aria-label="Statement section">` with `Auto` + type-specific MPERS blocks), `Currency` (`MYR`), `Normal` (`Debit` / `Credit`), `Status` (`Active` / `Disabled` chip), and `Actions` (`Reclassify`, `Mark as cash` / `Unmark cash` on assets, `Disable` / `Enable`, `Delete`).

## Kira's build

- **Routes:**
  - `src/app/[org]/settings/page.tsx` (redirects to `/{slug}/settings/profile`).
  - `src/app/[org]/settings/profile/page.tsx` (`SettingsProfilePage`).
  - `src/app/[org]/accounts/page.tsx` (`AccountsPage`).
  - Added `"settings"` and `"accounts"` to `BUILT_PATHS` in `src/shared/shell/nav.ts`; unbuilt `/settings/*` tabs continue to open the "coming soon" page.
- **Settings (`src/features/settings/`):**
  - `constants.ts`, `load.ts`, `actions.ts`, `profile-form.tsx`, `profile-page.tsx`.
  - Wired `organizations.default_pricing_mode` into `src/app/[org]/invoices/page.tsx` so new sales invoices inherit the org's default SST pricing setting.
  - Saving SSM, SST, and TIN automatically clears the `"Finish setup"` banner on both Dashboard and Ledger.
- **Chart of Accounts (`src/features/accounts/`):**
  - `types.ts`, `load.ts`, `actions.ts`, `accounts-client.tsx`, `accounts-page.tsx`.
  - Added client-side search filter (`Filter by code or name…`) and two-step delete confirmation (**Assumed**).
  - Included `"other_expense"` alongside `"operating_expense"` in `src/features/reports/engine.ts` so reclassified expense sections flow into P&L reports.
- **Database (`supabase/migrations/20261122001300_settings_accounts.sql`):**
  - Created private `org-assets` Storage bucket (PNG/JPEG, 2 MB limit) with owner write / member read policies; updated `scripts/e2e-user.mjs` cleanup to delete `org-assets` files.
  - Extended `organizations` with address, pricing mode, MyInvois, bank/payment, and asset path columns.
  - Owner-only RPCs: `org_for_owner`, `update_org_profile`, `set_org_asset`, `change_fiscal_year_end` (refuses when `journal_entries` exist or any period is not `open`).
  - Editor RPCs: `create_account`, `create_fixed_asset_pair` (auto-picks next free `200-XX00` / `200-XX05` pair), `update_account` (code, name, section, reclassify, cash toggle, active/disabled), `delete_account` (refuses if child accounts or transaction/document foreign keys exist).

## Verified (2026-11-22, real Supabase project, temporary user deleted afterwards)

- **Settings Profile:**
  - Dashboard initially showed `Finish setup` (`1`); after uploading a PNG logo (preview visible), filling SSM/SST/TIN + address + `Include SST` + e-Invoice + bank details and saving (`"Profile saved."`), Dashboard's `Finish setup` cleared (`0`) and new invoices defaulted to `Include SST`.
  - Changing fiscal year-end to `2027-06-30` (commencement `2026-07-01`) succeeded before transactions and updated `Fixed at bootstrap` (`2027-06-30`); after posting a journal entry, changing fiscal year-end was blocked (`"Fiscal year-end cannot be changed after transactions have been posted."`).
- **Chart of Accounts:**
  - Initial 107 MPERS accounts rendered across all 7 collapsible groups.
  - Added custom cash account `300-1300` (`Maybank Current Account`), created fixed-asset pair `200-0600` (`Plant and Machinery`) + `↳ 200-0605` (`Accumulated Depreciation - Plant and Machinery`), inline-renamed `300-1300` to `Maybank Biz Account`, toggled `Disable` / `Enable`, and deleted an unused account (`800-9900`).
  - After posting a journal entry on `300-1300`, deleting it was blocked cleanly (`"This account is used by existing transactions or documents. Disable it instead."`).
- **Interactive clicking/hovering browser audit:** Verified Settings tab bar hover states, logo preview, `MPERS` tooltip, `"Learn about this page"`, collapsible Add account / Fixed-asset panels (dynamic `Subtype` visibility), row hover & `"Mark as cash"` tooltip, accordion collapse/expand, filter + inline `Reclassify` controls, with zero console errors and zero HTTP `>= 400` responses.

## Review fix (Claude, 2026-11-22): system accounts

Kira's posting functions find some accounts **by code** and only when **active** (`account_id_for`). As first built, the chart of accounts let you change those codes, disable them, delete them (when unused), or mark them as cash. Any of these broke invoices, bills, receipts, payments, SST, bank charges or "Add a bank account".
- **Protected codes:** 300-0200, 300-0400, 300-1100, 400-0100, 400-1300, 400-1400, 400-1700 and 900-0600 (`public.system_account_codes()`).
- **Guard** (migrations `20261122001310_system_accounts.sql` and `…1320_system_accounts_cash.sql`): a `before update` trigger blocks changing their code, type or cash flag, and blocks disabling them. `delete_account` refuses them. Both raise `system_account`.
- **Still allowed:** renaming them and changing their statement section.
- **UI:** a "System" chip with a hover note. Code Edit, Reclassify, Mark as cash, Disable and Delete are hidden for these accounts. Enter saves and Escape cancels the inline code and name editors.
- **Verified:**
  - In rolled-back SQL: disabling 300-0200, recoding 400-1700 and marking 300-0200 as cash were all blocked; renaming 300-0200 and disabling 800-1200 were allowed.
  - In the browser: 300-0200 shows only the name Edit. After renaming it to "Trade Debtors", an 8% SST invoice still posted (RM108 = RM100 revenue + RM8 deferred SST), with the trial balance balanced.
- **Lejar's real solution is a "Control accounts" mapping** (Settings → Accounting, `/settings/control-accounts`), not built yet. With it, these roles could point at other accounts.
