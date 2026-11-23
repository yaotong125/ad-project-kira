/** Plain-language messages for the books functions' error codes (raised by the SQL functions in migration 400). */
const MESSAGES: Record<string, string> = {
  not_allowed: "You cannot change this entity's books.",
  period_closed: "That date is in a closed period or before your books start. Pick a date inside your open books.",
  unknown_account: "Pick an account from your chart for every line.",
  supplier_required: "Pick or type the supplier.",
  unknown_supplier: "That supplier is gone. Pick the supplier again.",
  payable_not_liability: "The payable account must be a liability account.",
  bill_number_taken: "Another bill already uses that number.",
  reference_taken: "Another journal entry already uses that reference.",
  due_before_bill: "The due date is before the bill date.",
  lines_required: "Add at least one line.",
  total_not_positive: "The bill total must be more than zero.",
  bad_quantity: "Every line needs a quantity above zero.",
  bad_price: "Every line needs a unit price.",
  unbalanced: "The Debit and Credit columns have to add up to the same total.",
  date_required: "Pick a date.",
  year_locked: "That date is in a locked financial year. An owner or admin can unlock the year under Financial year.",
  control_account_missing: "A control account is not set or is disabled. The owner can set it under Settings → Accounting.",
  tax_locked: "That date is on or before your SST tax lock date (an SST-02 you filed). Use a later date, or change the lock in Settings → Tax & e-Invois.",
  deferred_sst_account: "400-1700 Deferred SST only takes invoices and service tax moves. Pick another account.",
  draft_not_pending: "This inbox document was already recorded or dismissed. Reload the AI Inbox.",
};

export function booksError(error: { message?: string } | null | undefined): string {
  const code = error?.message?.trim() ?? "";
  return MESSAGES[code] ?? "Kira could not save this. Check the fields and try again.";
}
