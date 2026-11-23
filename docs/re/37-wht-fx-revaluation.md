# Slice 37 — Malaysian Withholding Tax (WHT) & Foreign Currency Revaluation

Completes Malaysian Income Tax Act 1967 withholding tax management (`/{slug}/wht`) and MPERS Section 30 month-end foreign currency revaluation (`/{slug}/fx-revaluation`).

## 1. Routes & Sidebar Navigation

| Route | Sidebar group | Purpose |
|---|---|---|
| `/{slug}/wht` | **Accounting → Withholding tax** | Record WHT deductions under Malaysian ITA 1967 sections (`s.109B` CP37D 10%, `s.109` CP37 Royalty 10% / Interest 15%, `s.107A` CP37A Contract 13%, `s.109F` CP37F 10%, `s.107D` CP107D Commission 2% with DTA treaty rate override), auto-post balanced double-entry journals to `400-1100 Withholding Tax Payable`, track 30-day LHDN statutory deadlines, post LHDN remittances, void unremitted entries, and export CP37 CSV for e-WHT filing. |
| `/{slug}/fx-revaluation` | **Banking → FX revaluation** | Post month-end MPERS Section 30 unrealised FX gain/loss adjustments against foreign currency asset/liability accounts using saved rates from Settings → Exchange rates, automatically creating `900-0500 Unrealised Foreign Exchange Gain` and `800-9500 Unrealised Foreign Exchange Loss`, with one-click next-day reversal. |

## 2. Database Migration (`supabase/migrations/20261124003400_wht_and_fx_revaluation.sql`)

- **Tables (RLS: `public.is_org_member(org_id)` read):**
  - `wht_entries`: payee, TIN, country, section/form code, payment & 30-day LHDN due dates, currency/FX rate, gross/WHT/net MYR, deduction/remittance/void journal links.
  - `fx_revaluations`: revaluation date, balance-sheet account, currency, foreign balance, closing rate, carrying MYR, revalued MYR, unrealised gain/loss MYR, posted/reversal journal links.
- **RPCs (`security definer`, `set search_path = public`):**
  - `record_wht_entry` — Dr Expense (Gross MYR), Cr `400-1100` WHT Payable, Cr Bank/Cash (Net MYR).
  - `remit_wht_entry` — Dr `400-1100` WHT Payable, Cr Bank/Cash with LHDN FPX/e-WHT receipt reference.
  - `void_wht_entry` — Posts exact reversing journal for unremitted entries.
  - `post_fx_revaluation` — Posts gain (Dr Account / Cr `900-0500`) or loss (Dr `800-9500` / Cr Account).
  - `reverse_fx_revaluation` — Posts next-day reversal journal for month-end auto-reversing adjustments.

## 3. Code Layout

- Feature module: `src/features/wht-fx/` (`types.ts`, `load.ts`, `actions.ts`, `wht-fx-client.tsx`, `wht-fx-pages.tsx`)
- App Router pages: `src/app/[org]/wht/page.tsx`, `src/app/[org]/fx-revaluation/page.tsx`
- Navigation: `src/shared/shell/nav.ts` (`wht` under Accounting, `fx-revaluation` under Banking, added to `BUILT_PATHS`).

## 4. Verification

- `npx tsc --noEmit`, `npm run lint`, and `npx next build` passed with **0 errors and 0 warnings** across all **98 routes**.
- Run `npm run db:migrate` once on an IPv6 network or IPv4 Session pooler URI to apply pending migrations (`20261124003100`–`20261124003400`).
