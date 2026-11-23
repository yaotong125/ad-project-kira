# Slice 17: Financial year and Control accounts

Reverse engineered from lejar.ai on 2026-11-22. All views were read-only: no buttons were clicked and no forms were submitted on Lejar. Sources:
- **Rendered pages** (signed-in debugging Chrome, scratchpad `pw/look.js`):
  - `/{slug}/periods` and `/{slug}/settings/control-accounts` on the user's test entity, Kira Test Sdn Bhd.
  - `/periods` on Lejar's read-only demo company (Selat Coffee Roasters), which has closed periods with close events.
- **Lejar's text bundle:** `earlierYears.error.*`, `ledger.errors.yearLocked`, `chat.actionOffer.addEarlierYear`.
- **Help and glossary:** help article `periods`, glossary term `fiscal-period`.

Legend: **Observed** · **Inferred** · **Assumed** (Kira's choice).

## Observed on Lejar

### `/{slug}/periods` (Financial year)
- **Header:** `Financial year`. The subtitle is `Accounting periods & close · {entity}`; "Accounting periods" is a hover hint with the `fiscal-period` glossary text. There is also a `Learn about this page` button.
- **Stat card:** three cells, `OPEN`, `CLOSING` and `CLOSED`, each with a period count.
- **Add an earlier year panel** (`data-testid="earlier-year-panel"`):
  - Text: "Your books start on {date}. Add the year before it to record that year's bills, invoices and payments on the dates they print. Up to 6 financial years back. Owner or admin only."
  - Below it, the year range and an `Add this year` button.
  - Error strings `earlierYears.error.*`:
    - `too_far`
    - `long_first_year`
    - `year_locked`: "Your first financial year has a locked or closed period…"
    - `leap_year_end`
    - `failed`
- **Lock financial years:**
  - Text: "Locking a year blocks new transactions (and voids) from being posted into any of its periods… Owner or admin only."
  - One row per year: `{start} → {end}`, `{n} periods` and a `Lock year` button.
- **Periods table:** newest first, with columns Period, Status, Close events, FX revaluation and Actions.
  - **Period:** a closed period has `closed at {timestamp}` under its range.
  - **Status:** a chip, `open` (brand colour) or `closed`.
  - **Close events:** a list of `close` / `reopen` (reopen in the warning colour), a timestamp, a 12-character hash (the full SHA-256 shows on hover) and the reopen reason in italics.
    - On the demo, close → reopen → close showed the **same hash** for both closes and a different one for the reopen. That fits a fingerprint of the books at the period end plus the action.
  - **FX revaluation:** `None`, plus a `Revalue FX` button on open periods.
  - **Actions:** `View transactions` → `/ledger?periodId={id}`.

### `/{slug}/settings/control-accounts` (Settings → Accounting)
- **Header and tabs:** subtitle `Control accounts · {entity}`, with sub-tabs Control accounts, Numbering, Price book and Exchange rates.
- **Introduction:** "Control accounts are the ledger accounts Lejar posts to automatically… Correct it here."
- **Summary list:** AP, AR, Non-trade AR, Non-trade AP, Realised FX and Unrealised FX. Each shows its account, or a `Not set` warning chip.
- **Form** (account pickers, placeholder `Find an account...`):

  | Field | Rule shown under it |
  |---|---|
  | Accounts Payable control account (required) | "Liability or contra-liability. Posted bills credit this account." |
  | Accounts Receivable control account (required) | "Asset or contra-asset. Posted invoices debit this account." |
  | Non-trade AR | "…Required before posting to a non-trade customer." |
  | Non-trade AP | – |
  | Realised FX gain/loss account | – |
  | Unrealised FX gain/loss account | – |

  The form ends with "Owner-only. Changes apply immediately." and a `Save` button.
- **Withholding tax accounts:** a second form, `Withholding Tax Payable` and `Withholding Tax Expense`.

## Built in Kira
- **Migration `20261122001500_financial_year.sql`.**
- **Control accounts:**
  - **Storage:**
    - `organizations.ar_account_id`, `ap_account_id`, `non_trade_ar_account_id` and `non_trade_ap_account_id`.
    - These are filled for existing entities from 300-0200, 400-0100 and 300-0400 (Kira's behaviour until now).
    - For new entities, an insert trigger on `accounts` fills them.
  - **Lookup:** `control_account(org, kind)` raises `control_account_missing`.
  - **Posting:** `post_invoice` now debits the trade or non-trade AR control account.
  - **Bills form:** the payable account defaults to the AP control account.
  - **System accounts:** `is_system_account` now means the fixed SST and bank-charge codes plus the entity's control accounts. The guard trigger, `delete_account` and the chart's `System` chip all follow the control accounts.
  - **Saving:** `set_control_accounts` is owner-only. AR must be an asset or contra-asset, AP a liability or contra-liability, neither a cash account, and the trade and non-trade accounts must differ.
- **Year lock:**
  - `assert_open_period` raises `year_locked` for dates in a locked year.
  - `period_postable` is the same check as a yes/no answer. `record_deemed_sst` uses it.
  - `set_fiscal_year_locked` is for owners and admins.
- **`add_earlier_year`** (owner or admin):
  - Adds the 12 months before the first year, split by the entity's cadence, and moves `books_start` back.
  - Errors: `too_far` (more than 6 years before the current year), `long_first_year`, `year_locked` (first year locked or with a closed period) and `leap_year_end`.
- **Close events:** `period_events.digest` is set by a trigger to SHA-256 of `action:period:balances up to the period end`.
- **Pages:**
  - `src/features/periods/*` serves `/[org]/periods`.
  - `src/features/settings/control-accounts-*` serves `/[org]/settings/control-accounts`.
  - The Ledger accepts Lejar's `?periodId=` link.

## Where Kira differs (Assumed)
- **FX:** Kira is MYR-only, so there is no FX revaluation column or `Revalue FX` button, and no realised or unrealised FX accounts.
- **Withholding tax:** Kira has none yet, so the WHT accounts form is not built.
- **Locked years:** a locked year shows a `locked` chip, and its button reads `Unlock year`. Lejar's unlock label was not seen.
- **Close and reopen** stay on the Ledger page, as on Lejar.
- **Not built:** `Learn about this page` (no help articles yet), and the Numbering / Price book / Exchange rates sub-tabs (they open "coming soon").
- **Non-trade AP:** Kira stores it but does not use it yet. Kira's bills choose the payable account on the form, and the form does not know the supplier's trade classification.

## Verified (2026-11-22)
- **End-to-end test** (`pw/e2e17.js`, temporary @example.com user, books from 2025):
  - **Earlier years:**
    - Counts read 12 open, 0 closing, 0 closed.
    - "Add this year" adds 2024, the books now start 2024-01-01, and the panel offers 2023.
  - **Year lock:**
    - With 2024 locked, an invoice dated 2024-06-15 is refused with the year-locked message.
    - Once unlocked, the same invoice records.
  - **Close events:**
    - `View transactions` opens the Ledger on 01/01/2024 → 29/02/2024.
    - Closing, reopening with a reason, and closing again shows `closed at`, three events and hashes `838f951db4fe, eddfef95886a, 838f951db4fe`. The two closes match, as on Lejar.
    - Adding 2023 is then refused because the first year has a closed period.
  - **Control accounts:**
    - Pointing AR at a new 300-0250 makes the next invoice post there; the trial balance still balances.
    - 300-0250 gets the `System` chip, while 300-0200 becomes editable and deletable again.
    - The bills form defaults to 400-0100.
- **Regressions:**
  - SST (`e2e16`) gives the same figures.
  - Chart of accounts (`e2e15`): the system chip shows, renaming AR still posts, and the trial balance balances.
- Typecheck, lint and build are clean.
