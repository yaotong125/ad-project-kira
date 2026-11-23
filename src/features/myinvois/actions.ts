"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import type { MyInvoisEnv } from "./types";

const MESSAGES: Record<string, string> = {
  unauthenticated: "Your session expired. Sign in again.",
  admin_only: "Only owners and admins can verify or change MyInvois settings.",
  myinvois_not_ready: "MyInvois is not configured yet. Complete your profile and verify setup in Settings.",
  not_found: "Record not found.",
  invoice_not_recorded: "Only recorded invoices can be submitted to MyInvois.",
  already_submitted: "This invoice already has an active MyInvois submission.",
  cancel_reason_required: "Enter a cancellation reason (at least 2 characters).",
  not_valid: "Only validated e-Invoices can be cancelled.",
  cancel_window_closed: "LHDN only allows cancelling a validated e-Invoice within 72 hours. Issue a credit note instead.",
};

function mapErr(message: string | undefined): string {
  if (!message) return "Something went wrong. Please try again.";
  for (const [k, v] of Object.entries(MESSAGES)) {
    if (message.includes(k)) return v;
  }
  return message;
}

export async function verifyMyInvoisSetupAction(
  orgSlug: string,
  environment: MyInvoisEnv,
): Promise<{ ok: true; ready: true; environment: MyInvoisEnv } | { ok: true; ready: false; missing: string[] } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("verify_myinvois_setup", {
    p_slug: orgSlug,
    p_environment: environment,
  });
  if (error) return { ok: false, error: mapErr(error.message) };
  revalidatePath(`/${orgSlug}/settings/e-invoice`);
  revalidatePath(`/${orgSlug}/myinvois`);
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ready) {
    return { ok: true, ready: true, environment: r.environment === "production" ? "production" : "sandbox" };
  }
  return { ok: true, ready: false, missing: Array.isArray(r.missing) ? (r.missing as string[]) : [] };
}

export async function disableMyInvoisAction(orgSlug: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("disable_myinvois_setup", { p_slug: orgSlug });
  if (error) return { ok: false, error: mapErr(error.message) };
  revalidatePath(`/${orgSlug}/settings/e-invoice`);
  revalidatePath(`/${orgSlug}/myinvois`);
  return { ok: true };
}

export async function submitInvoiceMyInvoisAction(
  orgSlug: string,
  invoiceId: string,
): Promise<
  | { ok: true; status: string; lhdnUuid: string | null; rejectionReason: string | null }
  | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("submit_invoice_myinvois", {
    p_slug: orgSlug,
    p_invoice_id: invoiceId,
  });
  if (error) return { ok: false, error: mapErr(error.message) };
  revalidatePath(`/${orgSlug}/myinvois`);
  revalidatePath(`/${orgSlug}/invoices/${invoiceId}`);
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    status: String(r.status ?? ""),
    lhdnUuid: r.lhdnUuid ? String(r.lhdnUuid) : null,
    rejectionReason: r.rejectionReason ? String(r.rejectionReason) : null,
  };
}

export async function cancelMyInvoisSubmissionAction(
  orgSlug: string,
  submissionId: string,
  invoiceId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_myinvois_submission", {
    p_slug: orgSlug,
    p_submission_id: submissionId,
    p_reason: reason,
  });
  if (error) return { ok: false, error: mapErr(error.message) };
  revalidatePath(`/${orgSlug}/myinvois`);
  revalidatePath(`/${orgSlug}/invoices/${invoiceId}`);
  return { ok: true };
}
