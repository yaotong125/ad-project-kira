import "server-only";
import { configuredFromAddress, isEmailConfigured } from "@/shared/email/mailer";
import type { createSupabaseServerClient } from "@/shared/supabase/server";
import type { ApiKeyRow, ApiKeyScope, AutomationRunRow, EmailLogRow, WebhookRow } from "./types";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export async function loadApiKeys(supabase: Supabase, orgId: string): Promise<ApiKeyRow[]> {
  const { data } = await supabase
    .from("org_api_keys")
    .select("id, name, key_prefix, scope, created_at, last_used_at, revoked_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []).map((k) => ({
    id: k.id,
    name: k.name,
    keyPrefix: k.key_prefix,
    scope: k.scope === "write" ? ("write" as ApiKeyScope) : "read",
    createdAt: k.created_at,
    lastUsedAt: k.last_used_at ?? null,
    revokedAt: k.revoked_at ?? null,
  }));
}

export async function loadWebhooks(supabase: Supabase, orgId: string): Promise<WebhookRow[]> {
  const { data } = await supabase
    .from("org_webhooks")
    .select("id, url, events, signing_secret_prefix, enabled, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []).map((w) => ({
    id: w.id,
    url: w.url,
    events: Array.isArray(w.events) ? w.events : [],
    signingSecretPrefix: w.signing_secret_prefix,
    enabled: Boolean(w.enabled),
    createdAt: w.created_at,
  }));
}

export async function loadDataAiSettings(supabase: Supabase, orgId: string) {
  const [{ data: org }, { count: chatCount }, runsRes, emailRes] = await Promise.all([
    supabase.from("organizations").select("ai_memory_enabled, auto_run_enabled").eq("id", orgId).single(),
    supabase.from("chat_conversations").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    supabase
      .from("org_automation_runs")
      .select("id, trigger_source, as_of_date, invoices_generated, bills_generated, depreciation_posted, prepaids_posted, status, error_message, ran_at")
      .eq("org_id", orgId)
      .order("ran_at", { ascending: false })
      .limit(10),
    supabase
      .from("org_email_logs")
      .select("id, doc_type, recipient_email, subject, status, sent_at")
      .eq("org_id", orgId)
      .order("sent_at", { ascending: false })
      .limit(10),
  ]);
  const automationRuns: AutomationRunRow[] = (runsRes.data ?? []).map((r) => ({
    id: r.id as string,
    triggerSource: r.trigger_source === "cron" ? "cron" : "manual",
    asOfDate: r.as_of_date as string,
    invoicesGenerated: Number(r.invoices_generated ?? 0),
    billsGenerated: Number(r.bills_generated ?? 0),
    depreciationPosted: Number(r.depreciation_posted ?? 0),
    prepaidsPosted: Number(r.prepaids_posted ?? 0),
    status: r.status === "failed" ? "failed" : r.status === "partial" ? "partial" : "ok",
    errorMessage: (r.error_message as string | null) ?? null,
    ranAt: r.ran_at as string,
  }));
  const emailLogs: EmailLogRow[] = (emailRes.data ?? []).map((e) => ({
    id: e.id as string,
    docType: e.doc_type as EmailLogRow["docType"],
    recipientEmail: e.recipient_email as string,
    subject: e.subject as string,
    status: e.status === "sent" ? "sent" : e.status === "failed" ? "failed" : "skipped",
    sentAt: e.sent_at as string,
  }));
  return {
    aiMemoryEnabled: org?.ai_memory_enabled !== false,
    autoRunEnabled: (org as { auto_run_enabled?: boolean } | null)?.auto_run_enabled !== false,
    chatCount: chatCount ?? 0,
    automationRuns,
    emailConfigured: isEmailConfigured(),
    emailFrom: configuredFromAddress(),
    emailLogs,
  };
}

export async function loadSecuritySettings(supabase: Supabase, orgId: string) {
  const [{ data: org }, mfaRes] = await Promise.all([
    supabase.from("organizations").select("require_mfa_for_admins").eq("id", orgId).single(),
    supabase.auth.mfa.listFactors().catch(() => ({ data: null })),
  ]);
  const totpFactors = (mfaRes?.data?.totp ?? []).filter((f) => f.status === "verified");
  return {
    requireMfaForAdmins: Boolean(org?.require_mfa_for_admins),
    mfaEnrolledCount: totpFactors.length,
  };
}
