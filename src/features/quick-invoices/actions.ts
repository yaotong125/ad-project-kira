"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import type { QuickInvoiceFormInput } from "./types";

const MESSAGES: Record<string, string> = {
  unauthenticated: "Your session expired. Sign in again.",
  not_found: "Quick invoice not found.",
  date_required: "Enter an invoice date.",
  due_before_date: "Due date cannot be earlier than the invoice date.",
  customer_required: "Enter or choose a customer.",
  unknown_customer: "Customer not found.",
  one_line: "Add at least one line item.",
  line_description: "Enter a description on every line.",
  quantity_positive: "Quantity must be greater than zero.",
  amount_format: "Unit price must be zero or more.",
  discount_format: "Discount value is out of range.",
  unknown_account: "Choose a valid active revenue account.",
  not_draft: "Sent quick invoices can no longer be edited.",
  already_sent: "This quick invoice has already been marked as sent.",
  only_draft_delete: "Only draft quick invoices can be deleted.",
};

function mapErr(message: string | undefined): string {
  if (!message) return "Something went wrong. Please try again.";
  if (message.includes("quick_invoices_org_id_invoice_number_key")) {
    return "An invoice with that number already exists.";
  }
  for (const [k, v] of Object.entries(MESSAGES)) {
    if (message.includes(k)) return v;
  }
  return message;
}

export async function saveQuickInvoiceAction(
  orgSlug: string,
  input: QuickInvoiceFormInput,
): Promise<{ ok: true; id: string; number: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_quick_invoice", {
    p_slug: orgSlug,
    p: input,
  });
  if (error) return { ok: false, error: mapErr(error.message) };
  const r = (data ?? {}) as Record<string, unknown>;
  const id = String(r.id ?? "");
  revalidatePath(`/${orgSlug}/quick-invoices`);
  if (id) revalidatePath(`/${orgSlug}/quick-invoices/${id}`);
  revalidatePath(`/${orgSlug}/contacts`);
  return { ok: true, id, number: String(r.number ?? "") };
}

export async function markQuickInvoiceSentAction(
  orgSlug: string,
  id: string,
): Promise<{ ok: true; invoiceId: string; invoiceNumber: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("mark_quick_invoice_sent", {
    p_slug: orgSlug,
    p_id: id,
  });
  if (error) return { ok: false, error: mapErr(error.message) };
  const r = (data ?? {}) as Record<string, unknown>;
  revalidatePath(`/${orgSlug}/quick-invoices`);
  revalidatePath(`/${orgSlug}/quick-invoices/${id}`);
  revalidatePath(`/${orgSlug}/invoices`);
  revalidatePath(`/${orgSlug}/contacts`);
  return {
    ok: true,
    invoiceId: String(r.invoiceId ?? ""),
    invoiceNumber: String(r.invoiceNumber ?? ""),
  };
}

export async function deleteQuickInvoiceDraftAction(
  orgSlug: string,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_quick_invoice_draft", {
    p_slug: orgSlug,
    p_id: id,
  });
  if (error) return { ok: false, error: mapErr(error.message) };
  revalidatePath(`/${orgSlug}/quick-invoices`);
  return { ok: true };
}
