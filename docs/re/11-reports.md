# Slice 11: Reports: profit & loss, balance sheet, cash flow (`/{slug}/reports`)

Reverse engineered from lejar.ai on 2026-11-22, read-only, from `/reports` on the user's test entity (no activity, so every section was empty), plus Lejar's help article "Reports and statements". The report texts are hard-coded English on Lejar (no i18n keys).

Legend: **Observed** · **Inferred** · **Assumed** (Kira's choice).

## Observed on Lejar

- **Report tabs:** Reports, Cashbook, General ledger, Aged payables, Aged receivables, Statement of account, Customer ledger, Supplier ledger, WHT due, Stock on hand, Stock movements (`/reports/{name}`).
- **Header:** "Reports", "{entity} · MPERS-aligned · FY {start} → {end}", and **Download year-end pack** (`/reports/year-end-pack?asOf=`).
- **Jump links:** Profit & loss / Balance sheet / Cash flow (`#profit-and-loss` …).
- **Filter form (GET):**
  - P&L from (default: start of the current financial year), P&L to (today), Balance sheet as of (today).
  - "Compare P&L to": None / Prior period / "Same period last year (unavailable)", with the note "There is no matching period in the prior financial year.", then **Recompute**.
- **Insights:** "Insights are pending data. They appear once this period has activity to compare."
- **Profit & loss** (`data-flow="pnl-report"`):
  - Sections Sales, Cost of Goods Sold, then **Gross profit / (loss)**; Other Income, Expenses, then **Net profit / (loss)**.
  - Empty sections show "No activity in this period."
  - Downloads: Download CSV (a button) and Download PDF (`/reports/profit-and-loss/pdf?from&to&compare`).
- **Balance sheet** ("as of … · net assets / financed by"):
  - Fixed Assets, Current Assets, Current Liabilities, **Net current assets**, **Net assets**.
  - "Financed by" (with a short explanation): Capital, Retained Earnings, Long Term Liabilities.
  - **Financed by** total and **Balanced**.
- **Cash flow** ("· direct method"): Operating / Investing / Financing activities, **Net change in cash**, Opening cash, **Closing cash**.

## Kira's build

- **`src/features/reports/engine.ts`:** the `Ledger` loads the entity's journal lines and builds each statement from the chart's `section` (sales, cost_of_sales, other_income, operating_expense, fixed_asset, current_asset, current_liability, equity, retained_earnings, long_term_liability).
  - **Retained Earnings** includes "Profit / (loss) not yet closed", since there is no year-end close yet. This is what makes the balance sheet balance.
  - **Cash flow (direct, inferred):** each entry's cash movement is classed by the other side of the entry with the largest amount. Fixed assets go to investing; equity, retained earnings and long-term liabilities go to financing; everything else is operating. Rows are shown per counterpart account.
  - **Comparisons:** "Prior period" is the same length just before; "Same period last year" is available only when it falls inside the books.
- **Page:** `src/app/[org]/reports/page.tsx`, with Lejar's layout and texts.
  - **Insights (assumed):** gross margin, the largest cost, and the change in net profit against the comparison.
  - Viewing a P&L with activity checks **Learn section 7** (inferred from "You read the profit and loss for your recorded entries").
- **Downloads:**
  - CSV from the browser.
  - PDFs via `pdf-lib` (`/reports/{profit-and-loss|balance-sheet|cash-flow}/pdf`, and `/reports/year-end-pack` with all three statements). Kira designed the PDF layout itself.
- **Navigation:** report tabs in `reports/layout.tsx`. The other 10 reports open "coming soon" (`reports/[...rest]`).

## Verified (2026-11-22, real Supabase project, temporary user deleted afterwards)

- **Before any activity:** Learn Start section 7 opened `/reports` with "READ YOUR PROFIT AND LOSS · 1 OF 1" and an empty P&L.
- **Entries posted:** capital 5,000; sales 1,000; supplies 200; purchases 300; an unpaid TNB bill of 100.
- **P&L:** Sales RM1,000, COGS RM300, **Gross RM700**, Expenses RM300 (Utilities 100, Supplies 200), **Net RM400**.
- **Balance sheet:**
  - Cash RM5,500, Trade Payables RM100, Net current assets = **Net assets RM5,400**.
  - Financed by: Capital RM5,000 + profit not closed RM400 = **RM5,400, Balanced**.
- **Cash flow:** Operating +1,000 −300 −200 (the unpaid bill is correctly excluded), Financing +5,000, **Net change RM5,500**, closing cash RM5,500.
- **Comparison:** November against the prior period (2–31 October) showed a second column of zeros. Insights read "Gross margin is 70.0% of sales", "The largest cost is Purchases…" and "Net profit is up RM400.00…".
- **Downloads:** the CSV downloaded with the comparison column. All 4 PDFs returned 200 application/pdf; the year-end pack has 3 pages.
- **Tabs:** the Cashbook tab shows "Coming soon".
- **Learn:** section 7 was checked.
