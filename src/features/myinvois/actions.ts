"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import {
  cancelLhdnDocument,
  encryptMyInvoisSecret,
  getLhdnAccessToken,
  getLhdnDocumentDetails,
  resolveLhdnCredentials,
  submitDocumentToLhdn,
  validateTaxpayerTin,
} from "./lhdn-client";
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

async function loadOrgLhdnContext(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, orgSlug: string) {
  const { data: base } = await supabase
    .from("organizations")
    .select("id, myinvois_environment")
    .eq("slug", orgSlug)
    .maybeSingle();
  if (!base) return null;

  const { data: credRow } = await supabase
    .from("organizations")
    .select("myinvois_client_id, myinvois_client_secret_enc, myinvois_on_behalf_of")
    .eq("id", base.id)
    .maybeSingle();

  const env: MyInvoisEnv = base.myinvois_environment === "production" ? "production" : "sandbox";
  const creds = resolveLhdnCredentials({
    clientId: credRow?.myinvois_client_id,
    clientSecretEnc: credRow?.myinvois_client_secret_enc,
    onBehalfOf: credRow?.myinvois_on_behalf_of,
  });
  return { orgId: base.id as string, env, creds };
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

export async function saveMyInvoisCredentialsAction(
  orgSlug: string,
  input: { clientId: string; clientSecret: string; onBehalfOf: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const clientId = input.clientId.trim();
  if (!clientId) return { ok: false, error: "Client ID is required." };

  let enc = "";
  let hint = "";
  const rawSecret = input.clientSecret.trim();
  if (rawSecret) {
    try {
      enc = encryptMyInvoisSecret(rawSecret);
      hint = `••••${rawSecret.slice(-4)}`;
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Server encryption key is not configured." };
    }
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_myinvois_credentials", {
    p_slug: orgSlug,
    p_client_id: clientId,
    p_client_secret_enc: enc,
    p_client_secret_hint: hint,
    p_on_behalf_of: input.onBehalfOf.trim(),
  });
  if (error) return { ok: false, error: mapErr(error.message) };
  revalidatePath(`/${orgSlug}/settings/e-invoice`);
  revalidatePath(`/${orgSlug}/myinvois`);
  return { ok: true };
}

export async function clearMyInvoisCredentialsAction(orgSlug: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("clear_myinvois_credentials", { p_slug: orgSlug });
  if (error) return { ok: false, error: mapErr(error.message) };
  revalidatePath(`/${orgSlug}/settings/e-invoice`);
  revalidatePath(`/${orgSlug}/myinvois`);
  return { ok: true };
}

export async function testMyInvoisConnectionAction(
  orgSlug: string,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadOrgLhdnContext(supabase, orgSlug);
  if (!ctx) return { ok: false, error: "Organisation not found." };
  if (!ctx.creds) {
    return {
      ok: false,
      error: "No LHDN Client ID / Secret configured yet. Save org credentials above or set MYINVOIS_CLIENT_ID & MYINVOIS_CLIENT_SECRET in server env.",
    };
  }
  const tok = await getLhdnAccessToken(ctx.creds, ctx.env);
  if (!tok.ok) return { ok: false, error: tok.error };
  return {
    ok: true,
    message: `Connected to LHDN MyInvois (${ctx.env}) via ${ctx.creds.source === "org" ? "organisation" : "platform"} credentials. OAuth token valid for ${tok.expiresIn}s.`,
  };
}

export async function validateTaxpayerTinAction(
  orgSlug: string,
  input: { tin: string; idType: "BRN" | "NRIC" | "PASSPORT" | "ARMY"; idValue: string },
): Promise<{ ok: true; valid: boolean; message: string } | { ok: false; error: string }> {
  if (!input.tin.trim() || !input.idValue.trim()) {
    return { ok: false, error: "Enter both a Taxpayer TIN and ID value." };
  }
  const supabase = await createSupabaseServerClient();
  const ctx = await loadOrgLhdnContext(supabase, orgSlug);
  if (!ctx) return { ok: false, error: "Organisation not found." };
  if (!ctx.creds) {
    return { ok: false, error: "Save LHDN API credentials first to validate TINs live against LHDN." };
  }
  return validateTaxpayerTin(ctx.creds, ctx.env, input);
}

export async function submitInvoiceMyInvoisAction(
  orgSlug: string,
  invoiceId: string,
): Promise<
  | { ok: true; status: string; lhdnUuid: string | null; rejectionReason: string | null; liveApi: boolean }
  | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  // Step 1: Validate LHDN v1.1 rules & build the UBL-JSON payload in Postgres.
  const { data, error } = await supabase.rpc("submit_invoice_myinvois", {
    p_slug: orgSlug,
    p_invoice_id: invoiceId,
  });
  if (error) return { ok: false, error: mapErr(error.message) };

  const r = (data ?? {}) as Record<string, unknown>;
  let status = String(r.status ?? "");
  let lhdnUuid = r.lhdnUuid ? String(r.lhdnUuid) : null;
  let rejectionReason = r.rejectionReason ? String(r.rejectionReason) : null;
  const submissionId = r.id ? String(r.id) : null;
  let liveApi = false;

  // Step 2: If live LHDN credentials are configured and local pre-flight passed, transmit to LHDN REST API.
  if (submissionId && status !== "rejected") {
    const ctx = await loadOrgLhdnContext(supabase, orgSlug);
    if (ctx?.creds) {
      const [{ data: subRow }, { data: invRow }] = await Promise.all([
        supabase.from("myinvois_submissions").select("payload").eq("id", submissionId).maybeSingle(),
        supabase.from("invoices").select("invoice_number").eq("id", invoiceId).maybeSingle(),
      ]);
      const payload = (subRow?.payload as Record<string, unknown> | null) ?? null;
      if (payload && invRow?.invoice_number) {
        liveApi = true;
        const apiRes = await submitDocumentToLhdn(ctx.creds, ctx.env, {
          codeNumber: invRow.invoice_number as string,
          ublPayload: payload,
        });
        if (!apiRes.ok) {
          status = "rejected";
          rejectionReason = apiRes.error;
          lhdnUuid = null;
          await supabase
            .rpc("record_myinvois_api_result", {
              p_slug: orgSlug,
              p_submission_id: submissionId,
              p_status: "rejected",
              p_lhdn_uuid: null,
              p_long_id: null,
              p_submission_uid: null,
              p_rejection_reason: apiRes.error,
            })
            .then(() => {}, () => {});
        } else if (!apiRes.accepted || !apiRes.uuid) {
          status = "rejected";
          rejectionReason = apiRes.rejectionReason;
          lhdnUuid = null;
          await supabase
            .rpc("record_myinvois_api_result", {
              p_slug: orgSlug,
              p_submission_id: submissionId,
              p_status: "rejected",
              p_lhdn_uuid: null,
              p_long_id: null,
              p_submission_uid: apiRes.submissionUid,
              p_rejection_reason: apiRes.rejectionReason,
            })
            .then(() => {}, () => {});
        } else {
          lhdnUuid = apiRes.uuid;
          status = "pending";
          let longId: string | null = null;
          let validatedAt: string | null = null;

          // Fetch immediate status details from LHDN (often validates within ~1s).
          const details = await getLhdnDocumentDetails(ctx.creds, ctx.env, apiRes.uuid);
          if (details.ok) {
            status = details.status;
            longId = details.longId;
            validatedAt = details.validatedAt;
            rejectionReason = details.rejectionReason;
          }
          await supabase
            .rpc("record_myinvois_api_result", {
              p_slug: orgSlug,
              p_submission_id: submissionId,
              p_status: status,
              p_lhdn_uuid: apiRes.uuid,
              p_long_id: longId,
              p_submission_uid: apiRes.submissionUid,
              p_rejection_reason: rejectionReason,
              p_validated_at: validatedAt,
            })
            .then(() => {}, () => {});
        }
      }
    }
  }

  revalidatePath(`/${orgSlug}/myinvois`);
  revalidatePath(`/${orgSlug}/invoices/${invoiceId}`);
  return { ok: true, status, lhdnUuid, rejectionReason, liveApi };
}

export async function syncMyInvoisStatusAction(
  orgSlug: string,
  submissionId: string,
  invoiceId: string,
): Promise<{ ok: true; status: string; longId: string | null } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const [ctx, { data: sub }] = await Promise.all([
    loadOrgLhdnContext(supabase, orgSlug),
    supabase.from("myinvois_submissions").select("lhdn_uuid").eq("id", submissionId).maybeSingle(),
  ]);
  if (!ctx?.creds) return { ok: false, error: "LHDN live API credentials are not configured." };
  if (!sub?.lhdn_uuid) return { ok: false, error: "Submission does not have an LHDN UUID yet." };

  const details = await getLhdnDocumentDetails(ctx.creds, ctx.env, sub.lhdn_uuid as string);
  if (!details.ok) return details;

  await supabase.rpc("record_myinvois_api_result", {
    p_slug: orgSlug,
    p_submission_id: submissionId,
    p_status: details.status,
    p_lhdn_uuid: sub.lhdn_uuid as string,
    p_long_id: details.longId,
    p_submission_uid: null,
    p_rejection_reason: details.rejectionReason,
    p_validated_at: details.validatedAt,
  });

  revalidatePath(`/${orgSlug}/myinvois`);
  revalidatePath(`/${orgSlug}/invoices/${invoiceId}`);
  return { ok: true, status: details.status, longId: details.longId };
}

export async function cancelMyInvoisSubmissionAction(
  orgSlug: string,
  submissionId: string,
  invoiceId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const [ctx, { data: sub }] = await Promise.all([
    loadOrgLhdnContext(supabase, orgSlug),
    supabase.from("myinvois_submissions").select("lhdn_uuid").eq("id", submissionId).maybeSingle(),
  ]);

  if (ctx?.creds && sub?.lhdn_uuid) {
    const apiCancel = await cancelLhdnDocument(ctx.creds, ctx.env, {
      uuid: sub.lhdn_uuid as string,
      reason,
    });
    if (!apiCancel.ok) return apiCancel;
  }

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
