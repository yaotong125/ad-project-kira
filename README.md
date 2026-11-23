# Kira

Accounting for Malaysian companies. Kira's screens are reverse engineered from
[lejar.ai](https://lejar.ai) one feature at a time: Lejar's layout, Kira's name, logo, colours and font.

## Stack

Inferred from lejar.ai (see [docs/re/01-sign-in.md](docs/re/01-sign-in.md)):
Next.js 16 (App Router, Server Actions, `proxy.ts`), React 19, TypeScript, Tailwind CSS v4,
Supabase Auth (`@supabase/ssr`, PKCE).

## Vertical slices

Each slice ships one feature end to end: page, Server Actions / route handlers, and the Supabase
setup it needs, with the reverse-engineering notes in `docs/re/`.

| # | Slice | Status | Notes |
|---|---|---|---|
| 1 | Sign in (`/login`): magic link, password, Google, BM/EN, error/notice banners, auth callback, route protection | built | [docs/re/01-sign-in.md](docs/re/01-sign-in.md) |
| 2 | Sign up (`/signup`, `/auth/confirm`): sign-in link, password account, Google, Terms, "Check your email", resend confirmation | built | [docs/re/02-sign-up.md](docs/re/02-sign-up.md) |
| 3 | Company setup (`/new-org`): entity form, financial year + periods, Lejar's MPERS chart, `/dashboard` / `/post-auth` routing | built | [docs/re/03-new-org.md](docs/re/03-new-org.md) |
| 4 | Learn Kira (`/{slug}/learn`, from `/getting-started`) + the app frame (sidebar, top bar, menus); unbuilt links open "coming soon" | built | [docs/re/04-learn.md](docs/re/04-learn.md) |
| 5 | AI Inbox (`/{slug}/inbox`): upload → Claude drafts → review on `/bills?aiDraft=` or `/journal-entries?aiDraft=` → record to the ledger (checks Learn section 1) | built | [docs/re/05-ai-inbox.md](docs/re/05-ai-inbox.md) |
| 6 | Contacts (`/{slug}/contacts`, Customers / Suppliers views, contact page) + Learn's guided flows | built | [docs/re/06-contacts.md](docs/re/06-contacts.md) |
| 7 | Sales invoices (`/{slug}/invoices`): form with SST-inclusive pricing, discounts and e-Invoice codes, drafts, record, void, PDF, AI Inbox drafts | built | [docs/re/07-invoices.md](docs/re/07-invoices.md) |
| 8 | Bank statement import (`/{slug}/import`): CSV parser + AI for PDFs/photos, AI categories, match existing entries, record in one batch | built | [docs/re/08-bank-import.md](docs/re/08-bank-import.md) |
| 9 | Bank reconciliation (`/{slug}/reconcile`): tie-out, tick lines, imported lines clear automatically, saved history | built | [docs/re/09-reconcile.md](docs/re/09-reconcile.md) |
| 10 | Ask Kira (`/{slug}/chat`): streaming answers from the books via Claude tool use, saved conversations | built | [docs/re/10-ask-kira.md](docs/re/10-ask-kira.md) |
| 11 | Reports (`/{slug}/reports`): profit & loss with comparison, balance sheet, cash flow, insights, CSV/PDF, year-end pack | built | [docs/re/11-reports.md](docs/re/11-reports.md) |
| 12 | Payments received / made: receipts against invoices (SST released), payments against bills (or paid by an owner), voids, settle bank lines | built | [docs/re/12-payments.md](docs/re/12-payments.md) |
| 13 | Dashboard: inbox / Learn / setup cards, cash and month KPIs, bank balances, money owed both ways, 12-month cashflow chart, activity feed | built | [docs/re/13-dashboard.md](docs/re/13-dashboard.md) |
| 14 | Ledger (`/{slug}/ledger`, `/ledger/entries/[id]`): period range, trial balance (CSV/PDF), entries list with hide-voided toggle, reverse / void manual entries, period close / reopen with AR/AP tie-out | built | [docs/re/14-ledger.md](docs/re/14-ledger.md) |
| 15 | Settings & Chart of accounts (`/{slug}/settings/profile`, `/{slug}/accounts`): business profile, logo / payment QR uploads, default SST pricing, fiscal year-end change, full MPERS chart CRUD + fixed-asset pairs | built | [docs/re/15-settings-accounts.md](docs/re/15-settings-accounts.md) |
| 16 | SST-02 returns (`/{slug}/sst`, `/sst/deemed`, `/settings/sst`): periods by filing cadence, output tax by type and rate, documents behind the figure, ledger reconciliation, deemed payments after 12 months, tax lock date, Ask Kira `get_sst_02_return` | built | [docs/re/16-sst.md](docs/re/16-sst.md) |
| 17 | Financial year & Control accounts (`/{slug}/periods`, `/{slug}/settings/control-accounts`): add an earlier year, lock / unlock years, periods with close events and fingerprints, AR / AP control accounts used by posting | built | [docs/re/17-financial-year.md](docs/re/17-financial-year.md) |
| 18 | Credit / debit / refund notes (`/{slug}/notes`, `/notes/new`, `/notes/[id]`): draft → record → void against a recorded invoice, amount due and receipts follow notes, SST-02 counts them, AR tie-out includes them | built | [docs/re/18-sales-notes.md](docs/re/18-sales-notes.md) |
| 19 | Customer credit & deposits: receipt overpayment and prepayments kept as credit (400-1600), credit note excess on paid invoices, apply / undo on invoices, SST share on apply, contact credit panel | built | [docs/re/19-customer-credit.md](docs/re/19-customer-credit.md) |
| 20 | Quotes (`/{slug}/quotes`, `/quotes/[id]`, `/edit`, `/pdf`): draft → send → accept / decline / expire (auto on expiry) → convert to a draft invoice, void, delete, history, PDF | built | [docs/re/20-quotes.md](docs/re/20-quotes.md) |
| 21 | Delivery orders (`/{slug}/delivery-orders`, `/[id]`, `/edit`): create / edit while open, convert to a draft invoice, reopen after the invoice is voided, void, delete; invoices link back to their DO or quote | built | [docs/re/21-delivery-orders.md](docs/re/21-delivery-orders.md) |
| 22 | Supplier credit / debit notes and the bill page (`/{slug}/bills/[id]`, `/bills/notes`, `/bills/notes/new`, `/bills/notes/[id]`): notes mirror the bill posting, bill amount due / payments follow notes, bill void, AP tie-out with notes | built | [docs/re/22-supplier-notes.md](docs/re/22-supplier-notes.md) |
| 23 | Recurring invoices & recurring bills (`/{slug}/recurring-invoices`, `/{slug}/recurring-bills`): weekly / monthly / quarterly / yearly schedules, prefix uniqueness, idempotent "Generate due now", auto-record or draft review, pause / resume / cancel, run ledger, draft bill posting | built | [docs/re/23-recurring.md](docs/re/23-recurring.md) |
| 24 | Official receipts, Payment vouchers & Bank transfers (`/{slug}/official-receipts`, `/{slug}/expenses`, `/{slug}/banking/transfers`, `/[id]`): direct cash/bank money in & out (edit = void + repost), multi-line vouchers, inter-account transfers with optional Bank Charges fee & void reversal | built | [docs/re/24-cash-vouchers-transfers.md](docs/re/24-cash-vouchers-transfers.md) |
| 25 | Fixed assets & Prepaid amortisation (`/{slug}/fixed-assets`, `/[id]`, `/{slug}/prepaid-amortisations`, `/[id]`): asset register with paired contra accounts, idempotent straight-line depreciation with final-month rounding & auto-retirement, disposal with gain/loss (`900-0400`), prepaid schedules with auto-post / manual posting & cancellation | built | [docs/re/25-fixed-assets-prepaids.md](docs/re/25-fixed-assets-prepaids.md) |
| 26 | Team & roles (`/{slug}/settings/team`, `/{slug}/settings/activity`, `/invite/[token]`): Owner / Admin / Bookkeeper / Viewer RBAC, invite links & revocation, live role switching, two-step member removal, public invitation acceptance flow, Team & ledger activity log | built | [docs/re/26-team-and-activity.md](docs/re/26-team-and-activity.md) |
| 27 | Quick invoices (`/{slug}/quick-invoices`, `/new`, `/[id]`, `/[id]/edit`, `/[id]/pdf`): fast single-screen customer billing with discounts & SST, live A4 PDF preview embedding org Logo + Payment QR + DuitNow/bank details, `Mark Sent` pushes a linked draft invoice into Books | built | [docs/re/27-quick-invoices.md](docs/re/27-quick-invoices.md) |
| 28 | Migrate (`/{slug}/migrate`): opening balances at cutover from CSV / Excel (SQL Account, AutoCount, MYOB, Bukku), Xero, Sage UBS, or manual entry; downloadable CSV template, MPERS auto-mapping, YTD P&L fold-in to Retained Earnings, one balanced opening entry & reversal | built | [docs/re/28-migrate.md](docs/re/28-migrate.md) |
| 29 | e-Invois (`/{slug}/myinvois`, `/{slug}/settings/e-invoice`, invoice detail panel): LHDN supplier profile checklist & intermediary verification, pre-flight buyer TIN/BRN checks, UBL-JSON v1.1 payload builder & preview, sandbox submission/rejection/retry & 72-hour cancellation | built | [docs/re/29-myinvois.md](docs/re/29-myinvois.md) |
| 30 | Inventory (`/{slug}/inventory`, `/locations`, `/stocktakes`, `/stocktakes/[id]`, `/transfers`, `/writedowns`, `/opening-import`): enable stock tracking (`300-0100` / `700-0400`), FIFO / moving average items, multi-location transfers, location-freezing stocktakes, write-downs, CSV opening stock with dry-run & exact ledger tie-out | built | [docs/re/30-inventory.md](docs/re/30-inventory.md) |
| 31 | Remaining Settings tabs (`/{slug}/settings/api-keys`, `/settings/webhooks`, `/settings/data`, `/settings/data/export`, `/settings/account`): hashed `kira_live_` API keys & revocation, signed webhook endpoints, full JSON org export, Kira AI memory controls, Owner-only org deletion, live BM/EN display language, password & 2FA enforcement | built | [docs/re/31-settings-extras.md](docs/re/31-settings-extras.md) |
| 32 | Accounting Settings sub-tabs (`/{slug}/settings/document-numbering`, `/settings/price-book`, `/settings/exchange-rates`): live numbering patterns & previews for 11 document types, reusable Price book catalog linked to MPERS revenue accounts, MYR-based Bank/BNM exchange rate register | built | [docs/re/32-accounting-settings.md](docs/re/32-accounting-settings.md) |
| 33 | Auth recovery & Legal pages (`/auth/forgot`, `/auth/reset`, `/terms`, `/privacy`): bilingual EN/BM password reset request & PKCE recovery update (with `/auth/reset` session guard), plus Malaysian-law / PDPA 2010 Terms of Service & Privacy Policy | built | [docs/re/33-auth-recovery-legal.md](docs/re/33-auth-recovery-legal.md) |

Code layout: `src/app/` holds routes only; each feature lives in `src/features/<slice>/`
(page component, copy, Server Actions); shared pieces (UI, i18n, Supabase clients) are in `src/shared/`.

## Setup

1. `npm install`
2. Create a free project at [supabase.com](https://supabase.com), then copy `.env.example` to
   `.env.local` and fill in the project URL and publishable (or anon) key
   (Project Settings → API).
3. In Supabase → Authentication → URL Configuration:
   - Site URL: `http://localhost:3000` (your real address in production)
   - Redirect URLs: `http://localhost:3000/auth/callback` (and the production equivalent)
4. Google sign-in (optional): Authentication → Sign In / Providers → Google. Create an OAuth client in
   Google Cloud Console (type "Web application") with the authorised redirect URI
   `https://<your-project-ref>.supabase.co/auth/v1/callback`, and paste its client ID and secret into Supabase.
5. Accounts: sign up at http://localhost:3000/signup (the confirmation email comes from Supabase), or add
   users in Supabase → Authentication → Users.
6. Database: add `SUPABASE_DB_URL=postgresql://…` (Supabase → Connect → Session pooler) to `.env.local`,
   then run `npm run db:migrate` to create Kira's tables (`supabase/migrations/`).
7. AI Inbox: add `ANTHROPIC_API_KEY=sk-ant-…` (console.anthropic.com → API keys) to `.env.local`.
   Kira reads each document with Claude Opus 5.5 (roughly 3–10 US cents per document: the page, the chart of accounts and the AI's reasoning). Without the key,
   uploads still work and "Analyze" says the AI is not set up.
8. `npm run dev` and open http://localhost:3000/login

Without `.env.local` the pages still render, but any action that talks to Supabase stops with a
"Supabase is not configured" error.

## Scripts

- `npm run dev`: development server
- `npm run build` / `npm start`: production build and server
- `npm run lint`
