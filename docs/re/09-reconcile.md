# Slice 9: Bank reconciliation (`/{slug}/reconcile`)

Reverse engineered from lejar.ai on 2026-11-22, read-only, on the user's test entity.

Sources:
- the landing page;
- a **GET tie-out** (`?account=300-0900&balance=100&date=2026-11-22`). The Reconcile button is a plain GET form, so nothing was written;
- the chunk `2kpch9e1ews-e` (ReconcileLines, SaveReconciliationButton, mark/unmark/save actions);
- Lejar's help article "Bank reconciliation";
- 75 `reconcile.*` strings.

Legend: **Observed** · **Inferred** · **Assumed** (Kira's choice).

## Observed on Lejar

- **Landing:**
  - Title "Reconcile bank account", with "{entity} · tie the ledger balance out to a bank statement".
  - A "Statement details" card (`data-flow="reconcile-setup"`) with Bank account, "Statement closing balance (RM)", "Statement date" and Reconcile, submitted as a GET form.
  - "No saved reconciliations yet" / "Saved reconciliations".
- **Result:**
  - Title "Reconcile · {code} {name}", "statement as of {date}", and a **Transfer** link (`/banking/transfers/new?from=`).
  - A strip: "{cleared} of {total} lines cleared", "{n} outstanding", Statement / GL balance / Difference, and **Save reconciliation**.
  - **Tie-out:** Statement closing balance; Outstanding items (n); Adjusted balance; GL balance per books; Difference with the chip "Reconciled" / "Does not reconcile" / "Enter statement balance".
  - **Sign:** statement 100, GL 0 showed Difference **−RM100.00**, so difference = GL − adjusted.
  - **Lines** (`data-flow="reconcile-lines"`):
    - "Outstanding lines · recorded, not yet on the statement", with a tick box, Date, Memo, Debit (in), Credit (out).
    - "Cancelled out" (an entry and its reversal).
    - "Reconciled lines · cleared", with Source (Manual / Import) and Undo.
  - Reconciliation history.
- **Actions:**
  - markLineReconciledAction(account, journalLineId, date = statement date) and unmarkLineReconciledAction.
  - saveReconciliationAction(account, date, balance). The save button is always enabled; each save is a dated record with a status.
- **Learn section 5:** "Tick each line that is on the statement, then save. One saved line checks the section." A bank-import match also counts ("Lejar marked the matched lines as reconciled").

## Kira's build

- **Migration `20261122000800_reconcile.sql`** (plus `…0810` for the difference sign):
  - `journal_lines` gets `id`, `reconciled_on`, `reconcile_source` (manual/import) and `reconciled_by`.
  - A trigger clears the bank-side line when a statement line is recorded or matched in Bank import (source "Import"). A match also checks Learn section 5.
  - Table `reconciliations`.
  - Functions: `mark_line_reconciled` (checks section 5), `unmark_line_reconciled`, `save_reconciliation` (status `reconciled` when the difference is 0).
- **The maths (page):**
  - **GL:** the sum of debit − credit for the account's lines up to the statement date.
  - **Outstanding:** lines not cleared on or before that date.
  - **Adjusted:** closing + outstanding.
  - **Difference:** GL − adjusted.
- **Code:** `src/features/reconcile/` (actions, lines and save button) and `src/app/[org]/reconcile/page.tsx`.

### Assumed / left out

- The account picker is a plain select, where Lejar has a combobox.
- "Cancelled out" pairs aren't shown, because no bank-side reversals exist yet (voided receipts and payments come with the payments slices).
- Transfer links to the not-yet-built Transfers page.

## Verified (2026-11-22, real Supabase project, fake Claude endpoint for the import categories, temporary user deleted afterwards)

- **Setup:** two manual cash entries (+1,000 capital, −200 supplies) and a CSV import of 4 lines, recorded and cleared automatically. Importing also checked Learn section 4.
- **Tour:** Learn Start section 5 showed "MATCH THE BANK TO YOUR BOOKS · 1 OF 2".
- **Tie-out:** 300-0900 at 2026-11-30 with closing 980.60 gave "4 of 6 lines cleared · 2 outstanding". Statement RM980.60, GL RM780.60, outstanding RM800.00, adjusted RM1,780.60, **Difference −RM1,000.00**, "Does not reconcile".
- **Ticking** the 1,000 line gave outstanding −RM200.00, adjusted RM780.60 = GL, "Difference RM0.00 · Reconciled", "Your books match the bank…".
- **Saving** added a history row (Reconciled).
- **Undo** brought back −RM1,000.00.
- **Learn:** section 5 was checked.
