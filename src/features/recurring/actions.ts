"use server";

import { revalidatePath } from "next/cache";
import { booksError } from "@/features/books/db-errors";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import type { Frequency, RecurringKind, RecurringLineInput } from "./types";

export type CreateRecurringInput = {
  kind: RecurringKind;
  name: string;
  contactId: string;
  contactName: string;
  frequency: Frequency;
  intervalCount: string;
  startDate: string;
  endDate: string;
  occurrencesLimit: string;
  dueOffsetDays: string;
  numberPrefix: string;
  autoRecord: boolean;
  notes: string;
  lines: RecurringLineInput[];
};

function message(kind: RecurringKind, e: { message?: string; details?: string; code?: string } | null): string {
  const code = e?.message?.trim() ?? "";
  const d = e?.details ?? "";
  const inv = kind === "invoice";
  switch (code) {
    case "template_name_short":
      return "The template name needs at least 2 characters.";
    case "template_name_long":
      return "Use at most 120 characters.";
    case "pick_contact":
      return inv ? "Pick a customer." : "Pick a supplier.";
    case "contact_missing":
      return inv
        ? "The selected customer does not exist in this organization."
        : "The selected supplier does not exist in this organization.";
    case "not_customer":
      return "The selected contact is not a customer.";
    case "not_supplier":
      return "The selected contact is not a supplier.";
    case "start_date_required":
      return "Start date must be YYYY-MM-DD";
    case "end_before_start":
      return "The end date must be on or after the start date.";
    case "invalid_every":
      return "Enter a whole number from 1 to 36.";
    case "invalid_occurrences":
      return "Enter a whole number from 1 to 999.";
    case "invalid_due_offset":
      return "Enter a whole number from 0 to 365.";
    case "prefix_required":
      return "A number prefix is required.";
    case "duplicate_prefix":
      return inv
        ? "Each recurring invoice needs its own prefix: the invoice number is the prefix plus the date, so two templates sharing one would clash on the same day."
        : "Each recurring bill for a supplier needs its own prefix: the bill number is the prefix plus the date, so two templates for one supplier sharing a prefix would clash on the same day.";
    case "add_line":
      return "Add at least one line.";
    case "line_description":
      return "A line description is required.";
    case "line_amount":
      return "A line amount is required.";
    case "account_missing":
      return `Account ${d} does not exist in this organization.`;
    case "account_inactive":
      return `Account ${d} is not active.`;
    case "account_type":
      return inv ? `Account ${d} must be a revenue account.` : `Account ${d} must be an expense or asset account.`;
    case "template_not_found":
      return "That recurring template could not be found.";
    case "not_active":
      return `That recurring template is not active, so it cannot move to ${d || "that status"}.`;
    case "not_paused":
      return `That recurring template is not paused, so it cannot move to ${d || "that status"}.`;
    default:
      return booksError(e);
  }
}

function refresh(slug: string, kind: RecurringKind) {
  const paths =
    kind === "invoice"
      ? ["recurring-invoices", "invoices", "ledger", "reports", ""]
      : ["recurring-bills", "bills", "ledger", "reports", ""];
  for (const p of paths) revalidatePath(p ? `/${slug}/${p}` : `/${slug}`);
}

export async function createRecurringAction(
  orgSlug: string,
  input: CreateRecurringInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_recurring_template", {
    p_slug: orgSlug,
    p: {
      kind: input.kind,
      name: input.name,
      contactId: input.contactId || null,
      contactName: input.contactName || null,
      frequency: input.frequency,
      intervalCount: input.intervalCount,
      startDate: input.startDate,
      endDate: input.endDate || null,
      occurrencesLimit: input.occurrencesLimit || null,
      dueOffsetDays: input.dueOffsetDays,
      numberPrefix: input.numberPrefix,
      autoRecord: input.autoRecord,
      notes: input.notes || null,
      lines: input.lines.map((l) => ({
        description: l.description,
        accountCode: l.accountCode,
        amount: l.amount,
        taxCode: l.taxCode || "none",
      })),
    },
  });
  if (error) return { ok: false, error: message(input.kind, error) };
  refresh(orgSlug, input.kind);
  return { ok: true, id: String(data) };
}

export async function setRecurringStatusAction(
  orgSlug: string,
  kind: RecurringKind,
  id: string,
  status: "paused" | "active" | "cancelled",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_recurring_status", {
    p_slug: orgSlug,
    p_id: id,
    p_status: status,
  });
  if (error) return { ok: false, error: message(kind, error) };
  refresh(orgSlug, kind);
  return { ok: true };
}

export async function generateDueRecurringAction(
  orgSlug: string,
  kind: RecurringKind,
): Promise<{ ok: true; evaluated: number; generated: number; recorded: number; failed: number } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("generate_due_recurring", {
    p_slug: orgSlug,
    p_kind: kind,
  });
  if (error) return { ok: false, error: message(kind, error) };
  refresh(orgSlug, kind);
  const r = data as { evaluated: number; generated: number; recorded: number; failed: number };
  return { ok: true, evaluated: r.evaluated ?? 0, generated: r.generated ?? 0, recorded: r.recorded ?? 0, failed: r.failed ?? 0 };
}
