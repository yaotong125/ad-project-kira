# Slice 27: Quick invoices

Reverse engineered from lejar.ai on 2026-11-23, read-only.
- Extracted all `quickInvoices.*` keys from Lejar's i18n chunk (`0sbs3p0t4lr74.js`).

Legend: **Observed** · **Inferred** · **Assumed** (Kira's choice).

## Observed on Lejar (i18n bundle)

- **Route & Header:** `/{slug}/quick-invoices` — `Quick invoices` (BM: `Invois pantas`), subtitle `{org} · invoice a customer in under a minute`, primary CTA `+ New quick invoice` (`/{slug}/quick-invoices/new`).
- **Core concept:** `"Bill a customer without touching the ledger. Sending one adds a draft invoice to your books automatically."`
- **List view:** Tabs `All` and `Drafts`; columns `Invoice no.`, `Customer`, `Invoice date`, `Due`, `Status` (`Draft` / `Sent`), `Total`; viewer read-only banner.
- **Form (`/{slug}/quick-invoices/new`, `/{slug}/quick-invoices/[id]/edit`):**
  - `Customer` (search or type a new customer with `"Save \"{name}\" as a new customer"`), optional `Customer email`, `Invoice number` (auto-assigned on draft creation, locked on edit), `Invoice date`, optional `Due date`, `Income account` (saved once for the company so typed lines land in the right revenue account in Books), `SST pricing` (`Exclude SST` / `Include SST`).
  - `Line items`: `Description` (`"What are you billing for?"`), `Qty`, `Unit price`, `Discount` (`No discount` / `Discount %` / `Discount RM` / `New price`), `SST` (`No SST`, `Service tax 8%`, `Service tax 6%`, `Sales tax 5%`, `Sales tax 10%`, `Exempt`), `+ Add line`, live `Subtotal before SST`, `SST`, `Total after SST`, `Notes (optional)`.
  - Right-hand read-only card **`What appears on the PDF`** with `"Change in Settings"` link to `/{slug}/settings/profile` showing `Legal name`, `SSM number`, `Address`, `Payment note`, `Logo` (`Set` / `Not set`), and `Payment QR` (`Set` / `Not set`).
- **Detail & Preview (`/{slug}/quick-invoices/[id]`):**
  - `Download PDF`, `Edit draft` (when draft), `Mark Sent` (with confirmation that it adds a draft invoice to Books and cannot be undone), `Delete draft`, and when `Sent`, direct link to the linked draft invoice in Books (`/{slug}/invoices/[id]`).
  - Embedded live PDF preview `<iframe>` with `"Not showing? Open the PDF in a new tab"`.

## Kira's build

- **Routes:**
  - `src/app/[org]/quick-invoices/page.tsx` (`QuickInvoicesListPage`)
  - `src/app/[org]/quick-invoices/new/page.tsx` (`QuickInvoiceFormPage`)
  - `src/app/[org]/quick-invoices/[id]/page.tsx` (`QuickInvoiceDetailPage`)
  - `src/app/[org]/quick-invoices/[id]/edit/page.tsx` (`QuickInvoiceFormPage` edit mode)
  - `src/app/[org]/quick-invoices/[id]/pdf/route.ts` — A4 PDF generator (`pdf-lib`) embedding org **Logo** and **Payment QR** from `org-assets` Storage alongside full address, bank account, DuitNow ID, and payment note; supports `?inline=1` for iframe preview and `attachment` for download.
  - Added `"quick-invoices"` to `BUILT_PATHS` in `src/shared/shell/nav.ts`.
- **Feature module (`src/features/quick-invoices/`):**
  - `types.ts`, `load.ts`, `actions.ts`, `quick-invoices-client.tsx`, `quick-invoices-page.tsx`.
  - **Assumed:** No free-plan monthly allowance cap or transactional email sending yet — users download/share the PDF and click `Mark Sent` to push the draft invoice into Books.
- **Database (`supabase/migrations/20261122002500_quick_invoices.sql` + `20261122002510_quick_invoices_contact_fix.sql`):**
  - Added `organizations.default_income_account_code` (`default '600-0100'`).
  - Added `quick_invoices` and `quick_invoice_lines` with RLS member read policies.
  - Added `next_quick_invoice_number` (`QI-YYYYMM-NNN`), `save_quick_invoice`, `mark_quick_invoice_sent` (creates a linked draft `invoices` + `invoice_lines` record and auto-creates the customer contact if needed), and `delete_quick_invoice_draft`.

## Verified (2026-11-23, real Supabase project, temporary user deleted afterwards)

- **Playwright E2E:**
  - Verified empty state → created `QI-202611-001` for new customer `"Syarikat Maju Jaya"` (auto-saved as customer) with 2 lines (`2 × RM1,000` less `10%` + `8% SST` = `RM1,944.00`, plus `1 × RM100` no SST = `RM2,044.00`).
  - Verified `/{slug}/quick-invoices/[id]/pdf` returned HTTP `200`, `application/pdf`, `2,227` bytes starting with `%PDF-`, and rendered cleanly in the embedded PDF preview iframe.
  - Edited draft note → clicked `Mark Sent` → `Confirm Mark Sent` → status changed to `Sent` and `"Open in Books (INV-202611-001)"` linked directly to the newly created `Draft` invoice in Books (`RM2,044.00`).
  - Created & deleted a temporary draft, then created a second draft (`QI-202611-002`, `RM540.00`) and verified list rows and tabs.
- **Interactive browser audit:** Verified sidebar nav under `Dashboard`, `All (2)` / `Drafts (1)` tab filtering, hover states on rows/tabs/`+ New quick invoice`, narrow-viewport layout alignment, and 0 HTTP `>= 400` responses (AUIT webview timed out on Step 4 while server remained healthy; remaining screens verified via Playwright screenshots). Added `?inline=1&v=${qi.status}` iframe cache-buster so `Mark Sent` immediately refreshes the embedded PDF header from `DRAFT INVOICE` to `INVOICE`.
