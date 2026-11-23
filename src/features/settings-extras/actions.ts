"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import type { ApiKeyScope } from "./types";

const MESSAGES: Record<string, string> = {
  unauthenticated: "Your session expired. Sign in again.",
  admin_only: "Only owners and admins can manage this setting.",
  not_found: "Record not found.",
  invalid_name: "Enter a name (1–100 characters).",
  invalid_url: "Enter a valid http:// or https:// endpoint URL.",
  events_required: "Select at least one webhook event.",
  name_mismatch: "The legal name you typed does not match this organisation.",
};

function mapErr(message: string | undefined): string {
  if (!message) return "Something went wrong. Please try again.";
  for (const [k, v] of Object.entries(MESSAGES)) {
    if (message.includes(k)) return v;
  }
  return message;
}

export async function createApiKeyAction(
  orgSlug: string,
  name: string,
  scope: ApiKeyScope,
): Promise<{ ok: true; secret: string; prefix: string } | { ok: false; error: string }> {
  const raw = `kira_live_${randomBytes(24).toString("base64url")}`;
  const prefix = raw.slice(0, 16);
  const hash = createHash("sha256").update(raw).digest("hex");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_org_api_key", {
    p_slug: orgSlug,
    p_name: name,
    p_scope: scope,
    p_key_prefix: prefix,
    p_key_hash: hash,
  });
  if (error) return { ok: false, error: mapErr(error.message) };
  revalidatePath(`/${orgSlug}/settings/api-keys`);
  revalidatePath(`/${orgSlug}/settings/activity`);
  return { ok: true, secret: raw, prefix };
}

export async function revokeApiKeyAction(orgSlug: string, id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("revoke_org_api_key", { p_slug: orgSlug, p_id: id });
  if (error) return { ok: false, error: mapErr(error.message) };
  revalidatePath(`/${orgSlug}/settings/api-keys`);
  revalidatePath(`/${orgSlug}/settings/activity`);
  return { ok: true };
}

export async function createWebhookAction(
  orgSlug: string,
  url: string,
  events: string[],
): Promise<{ ok: true; secret: string } | { ok: false; error: string }> {
  const secret = `whsec_${randomBytes(24).toString("base64url")}`;
  const prefix = secret.slice(0, 14);
  const hash = createHash("sha256").update(secret).digest("hex");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_org_webhook", {
    p_slug: orgSlug,
    p_url: url,
    p_events: events,
    p_secret_prefix: prefix,
    p_secret_hash: hash,
  });
  if (error) return { ok: false, error: mapErr(error.message) };
  revalidatePath(`/${orgSlug}/settings/webhooks`);
  return { ok: true, secret };
}

export async function toggleWebhookAction(
  orgSlug: string,
  id: string,
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("toggle_org_webhook", { p_slug: orgSlug, p_id: id, p_enabled: enabled });
  if (error) return { ok: false, error: mapErr(error.message) };
  revalidatePath(`/${orgSlug}/settings/webhooks`);
  return { ok: true };
}

export async function deleteWebhookAction(orgSlug: string, id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_org_webhook", { p_slug: orgSlug, p_id: id });
  if (error) return { ok: false, error: mapErr(error.message) };
  revalidatePath(`/${orgSlug}/settings/webhooks`);
  return { ok: true };
}

export async function setAiMemoryAction(orgSlug: string, enabled: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_ai_memory_enabled", { p_slug: orgSlug, p_enabled: enabled });
  if (error) return { ok: false, error: mapErr(error.message) };
  revalidatePath(`/${orgSlug}/settings/data`);
  return { ok: true };
}

export async function clearAiMemoryAction(orgSlug: string): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("clear_org_ai_memory", { p_slug: orgSlug });
  if (error) return { ok: false, error: mapErr(error.message) };
  revalidatePath(`/${orgSlug}/settings/data`);
  revalidatePath(`/${orgSlug}/chat`);
  return { ok: true, deleted: Number(data ?? 0) };
}

export async function deleteOrganizationAction(
  orgSlug: string,
  confirmName: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_organization", { p_slug: orgSlug, p_confirm_name: confirmName });
  if (error) return { ok: false, error: mapErr(error.message) };
  return { ok: true };
}

export async function saveLanguageAction(orgSlug: string, lang: "en" | "ms"): Promise<{ ok: true } | { ok: false; error: string }> {
  if (lang !== "en" && lang !== "ms") return { ok: false, error: "That is not a language Kira supports." };
  const store = await cookies();
  store.set("kira_lang", lang, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath(`/${orgSlug}`, "layout");
  return { ok: true };
}

export async function changePasswordAction(
  password: string,
  confirm: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
  if (password !== confirm) return { ok: false, error: "Passwords do not match." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function setRequireMfaAction(orgSlug: string, required: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_require_mfa_for_admins", { p_slug: orgSlug, p_required: required });
  if (error) return { ok: false, error: mapErr(error.message) };
  revalidatePath(`/${orgSlug}/settings/account`);
  return { ok: true };
}

export async function setAutoRunEnabledAction(
  orgSlug: string,
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_auto_run_enabled", { p_slug: orgSlug, p_enabled: enabled });
  if (error) return { ok: false, error: mapErr(error.message) };
  revalidatePath(`/${orgSlug}/settings/data`);
  return { ok: true };
}

export async function runOrgAutomationsNowAction(
  orgSlug: string,
): Promise<
  | {
      ok: true;
      invoicesGenerated: number;
      billsGenerated: number;
      depreciationPosted: number;
      prepaidsPosted: number;
      status: string;
    }
  | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("run_org_automations_now", { p_slug: orgSlug });
  if (error) return { ok: false, error: mapErr(error.message) };
  const res = (data ?? {}) as Record<string, unknown>;
  revalidatePath(`/${orgSlug}/settings/data`);
  revalidatePath(`/${orgSlug}/recurring-invoices`);
  revalidatePath(`/${orgSlug}/recurring-bills`);
  revalidatePath(`/${orgSlug}/fixed-assets`);
  revalidatePath(`/${orgSlug}/prepaid-amortisations`);
  return {
    ok: true,
    invoicesGenerated: Number(res.invoicesGenerated ?? 0),
    billsGenerated: Number(res.billsGenerated ?? 0),
    depreciationPosted: Number(res.depreciationPosted ?? 0),
    prepaidsPosted: Number(res.prepaidsPosted ?? 0),
    status: String(res.status ?? "ok"),
  };
}
