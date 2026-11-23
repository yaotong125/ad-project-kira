# Slice 13: Dashboard

Reverse engineered from lejar.ai on 2026-11-22, read-only.
- The dashboard `/{slug}` on the user's test entity Kira Test Sdn Bhd (empty books, one AI Inbox draft): page HTML and screenshot.
- The 85 `dashboard.*` strings (EN and BM) from chunk `0sbs3p0t4lr74.js`, and the help article "dashboard".
- The page is a server component; only `StepLink` and `PageHelpButton` are client code. So the populated states (unpaid lists, feed rows, chart) were never visible and are Kira's design, built from Lejar's strings and the empty-state markup.

Legend: **Observed** · **Inferred** · **Assumed** (Kira's choice).

## Observed on Lejar

Sections in order, with their `data-testid`s:
- **`dashboard-header`:** "Here's your business as of this {afternoon}" (or "…caught up to this {afternoon}"), "Good afternoon, {name} · {org} · figures for Nov 2026", "Learn about this page", "Review activity" → `/ledger`.
- **`dashboard-inbox`:** "AI Inbox · 1 document is ready for your review", "Review drafts". Strings also exist for uploads waiting for Analyze and uploads that could not be read.
- **`dashboard-learn`:** "Learn Lejar · 0 of 7 checked · Next: Turn a receipt into a bill", "Resume" (a StepLink that starts the section's guided flow).
- **`dashboard-finish-setup`:** "Fill in your regulatory identifiers · Missing: SSM, SST and TIN" → settings/profile, "Mint an API key", "I'm all set, hide this".
- **`dashboard-kpis`:** Cash on hand ("across 3 accounts"), Revenue, Expenses and Net profit. Hints: "vs last month", "no last month to compare", "margin {pct}%", "no revenue this month", "No activity yet this month". Net profit links to the P&L.
- **`dashboard-compliance`:** e-Invoice "Not set up" → "Set up e-Invoice". Strings also exist for the monthly LHDN check and consolidation, and an "SST returns" card.
- **`dashboard-balances`:**
  - Bank & cash accounts, with two-letter initials, code and book balance, plus "Match bank statement".
  - Money owed to you ("Send reminders"; empty: "Create an invoice").
  - Money you owe ("Pay bills"; empty: "Record a bill").
  - "and {count} more open".
- **`dashboard-cashflow`:** "Cashflow · last 12 months · Revenue and expenses, by month". Empty: "Not enough history yet · The chart fills in once two months have activity."
- **`dashboard-feed`:** "Activity feed · What lejar has handled, what needs you.", "All transactions" → `/ledger`. It renders as a table on desktop and a list on mobile; rows are Recorded or Reversed.

## Kira's build

- **Route:** `src/app/[org]/page.tsx`, replacing "coming soon".
- **`src/features/dashboard/`:**
  - `load.ts`: one loader for the current month in Malaysia time.
  - `dashboard-page.tsx`: Lejar's markup and classes.
  - `cashflow-chart.tsx`: client component.
  - Copy, actions, and the hide button.
- **What each section reads:**
  - **AI Inbox counts:** `ai_drafts` with status pending, analyzing (waiting) or failed. The card shows only when there's something to do; otherwise the headline reads "caught up".
  - **Learn:** the open section and "Resume", which uses the Learn page's start link and guided flow. Hidden once Learn is hidden or finished.
  - **Finish setup:** missing SSM / SST / TIN from `organizations`. "I'm all set, hide this" calls `set_setup_hidden` (migration `20261122001100_dashboard.sql`, new column `organizations.setup_hidden`). **Assumed:** no "Mint an API key" item, because Kira has no API keys yet.
  - **KPIs:** from the reports `Ledger` (new `balances()` helper).
    - Revenue = Sales + Other income; Expenses = Cost of sales + Expenses.
    - Compared with last month; an arrow and colour show whether the change is good or bad (falling expenses are good).
  - **Money owed both ways:** open invoices and bills net of payments, nearest due first, with "N days overdue".
    - **Assumed:** with items open, the buttons read "Record a receipt" and "Pay bills". Kira can't send reminders yet, so Lejar's "Send reminders" isn't used.
  - **Cashflow chart:**
    - Grouped bars per month: revenue in Kira teal `#00a69c`, expenses in Kira indigo `#5e5be9`. The pair passes the dataviz palette checks (CVD ΔE 21, contrast ≥ 3:1).
    - One axis with a recessive grid, a legend, a hover tooltip per month, and "Show as table".
  - **Activity feed:**
    - The latest 8 journal entries, showing the customer or supplier, the document number(s), a type chip, the account (the bank side if any, else the largest line), the amount, and Recorded / Reversed.
    - "Reversed" means a void entry shares the entry's source document.
- **Links to unbuilt pages:** `/ledger`, `/settings/profile` and `/sst` open "coming soon" until those slices.
- **Display name** for the greeting: the profile name, else the email's local part (`OrgContext.name`).

## Bug fixed along the way (sign-in language)

The BM/EN switch on `/login` and `/signup` is a `<Link>` to `?lang=ms`. Next.js prefetched it, and the proxy set the `kira_lang` cookie from the prefetch, so after signing in the app could turn Malay without anyone choosing it. Two fixes:
- The proxy now ignores prefetch requests (`next-router-prefetch` / `purpose` / `sec-purpose`).
- The language links use `prefetch={false}`.

Verified: viewing `/login` leaves no cookie; clicking BM sets `ms`.

## Verified (2026-11-22, real Supabase project, temporary user deleted afterwards)

- **Empty entity:**
  - "caught up" headline, Learn 0 of 7, "Missing: SSM, SST and TIN".
  - KPIs RM0.00 "across 3 accounts", the three cash accounts at RM0.00, both empty cards, the chart's empty state, and the feed's empty text. All match Lejar's empty page.
- **Hide setup:** the card disappears and stays hidden.
- **With entries** (October invoice 2,000 and bill 500; November invoice 1,200 due 10 Nov and bill 300; receipt 2,000):
  - Cash RM2,000.
  - Revenue RM1,200, "↘ 40% vs last month" in red; Expenses RM300, "↘ 40%" in green; Net RM900, "margin 75%".
  - Owed to you RM1,200, "12 days overdue"; you owe RM800.
  - The chart shows 12 months, with an October tooltip of RM2,000 / RM500 and a matching table.
  - The feed names each customer or supplier.
- **After voiding the receipt:** cash RM0, the receipt row "Reversed", the void row recorded, owed to you RM3,200.
- **Mobile (390px):** sections stack, and the feed becomes a list.
