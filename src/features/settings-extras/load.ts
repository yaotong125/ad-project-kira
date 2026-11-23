import "server-only";
import type { createSupabaseServerClient } from "@/shared/supabase/server";
import type { ApiKeyRow, ApiKeyScope, WebhookRow } from "./types";

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
  const [{ data: org }, { count: chatCount }] = await Promise.all([
    supabase.from("organizations").select("ai_memory_enabled").eq("id", orgId).single(),
    supabase.from("chat_conversations").select("id", { count: "exact", head: true }).eq("org_id", orgId),
  ]);
  return {
    aiMemoryEnabled: org?.ai_memory_enabled !== false,
    chatCount: chatCount ?? 0,
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
