import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { MyInvoisEnv } from "./types";

export type LhdnCredentials = {
  clientId: string;
  clientSecret: string;
  onBehalfOf?: string | null;
  source: "org" | "env";
};

const API_BASE: Record<MyInvoisEnv, string> = {
  sandbox: "https://preprod-api.myinvois.hasil.gov.my",
  production: "https://api.myinvois.hasil.gov.my",
};

const PORTAL_BASE: Record<MyInvoisEnv, string> = {
  sandbox: "https://preprod.myinvois.hasil.gov.my",
  production: "https://myinvois.hasil.gov.my",
};

export function lhdnPortalShareUrl(env: MyInvoisEnv, uuid: string, longId: string): string {
  return `${PORTAL_BASE[env]}/${encodeURIComponent(uuid)}/share/${encodeURIComponent(longId)}`;
}

// -----------------------------------------------------------------------------
// AES-256-GCM encryption for per-org stored LHDN client secrets
// -----------------------------------------------------------------------------
function deriveKey(): Buffer | null {
  const raw = process.env.MYINVOIS_ENCRYPTION_KEY?.trim();
  if (!raw || raw.length < 16) return null;
  return createHash("sha256").update(raw).digest();
}

export function isEncryptionConfigured(): boolean {
  return deriveKey() !== null;
}

export function encryptMyInvoisSecret(plain: string): string {
  const key = deriveKey();
  if (!key) throw new Error("MYINVOIS_ENCRYPTION_KEY (min 16 chars) must be set on the server to store org API secrets.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${enc.toString("base64url")}`;
}

export function decryptMyInvoisSecret(blob: string | null | undefined): string | null {
  if (!blob || !blob.startsWith("v1:")) return null;
  const key = deriveKey();
  if (!key) return null;
  const parts = blob.split(":");
  if (parts.length !== 4) return null;
  try {
    const iv = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[2], "base64url");
    const data = Buffer.from(parts[3], "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function resolveLhdnCredentials(orgCreds: {
  clientId?: string | null;
  clientSecretEnc?: string | null;
  onBehalfOf?: string | null;
}): LhdnCredentials | null {
  const orgCid = orgCreds.clientId?.trim();
  const orgSec = decryptMyInvoisSecret(orgCreds.clientSecretEnc);
  if (orgCid && orgSec) {
    return { clientId: orgCid, clientSecret: orgSec, onBehalfOf: orgCreds.onBehalfOf?.trim() || null, source: "org" };
  }
  const envCid = process.env.MYINVOIS_CLIENT_ID?.trim();
  const envSec = process.env.MYINVOIS_CLIENT_SECRET?.trim();
  if (envCid && envSec) {
    return {
      clientId: envCid,
      clientSecret: envSec,
      onBehalfOf: orgCreds.onBehalfOf?.trim() || process.env.MYINVOIS_ON_BEHALF_OF?.trim() || null,
      source: "env",
    };
  }
  return null;
}

// -----------------------------------------------------------------------------
// OAuth 2.0 token cache (per env + clientId + onBehalfOf)
// -----------------------------------------------------------------------------
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export async function getLhdnAccessToken(
  creds: LhdnCredentials,
  env: MyInvoisEnv,
): Promise<{ ok: true; accessToken: string; expiresIn: number } | { ok: false; error: string }> {
  const cacheKey = `${env}:${creds.clientId}:${creds.onBehalfOf ?? ""}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return { ok: true, accessToken: cached.token, expiresIn: Math.round((cached.expiresAt - Date.now()) / 1000) };
  }

  const form = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    grant_type: "client_credentials",
    scope: "InvoicingAPI",
  });
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (creds.onBehalfOf) headers.onbehalfof = creds.onBehalfOf;

  try {
    const res = await fetch(`${API_BASE[env]}/connect/token`, {
      method: "POST",
      headers,
      body: form.toString(),
    });
    const json = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || !json.access_token) {
      return {
        ok: false,
        error: json.error_description || json.error || `LHDN OAuth returned HTTP ${res.status}`,
      };
    }
    const expiresIn = Number(json.expires_in ?? 3600);
    tokenCache.set(cacheKey, { token: json.access_token, expiresAt: Date.now() + expiresIn * 1000 });
    return { ok: true, accessToken: json.access_token, expiresIn };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not reach LHDN MyInvois OAuth endpoint." };
  }
}

// -----------------------------------------------------------------------------
// REST API operations (LHDN MyInvois v1.0)
// -----------------------------------------------------------------------------
export async function validateTaxpayerTin(
  creds: LhdnCredentials,
  env: MyInvoisEnv,
  input: { tin: string; idType: "BRN" | "NRIC" | "PASSPORT" | "ARMY"; idValue: string },
): Promise<{ ok: true; valid: boolean; message: string } | { ok: false; error: string }> {
  const auth = await getLhdnAccessToken(creds, env);
  if (!auth.ok) return auth;

  const qs = new URLSearchParams({ idType: input.idType, idValue: input.idValue.trim() });
  try {
    const res = await fetch(`${API_BASE[env]}/api/v1.0/taxpayer/validate/${encodeURIComponent(input.tin.trim())}?${qs.toString()}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    });
    if (res.status === 200) return { ok: true, valid: true, message: `TIN ${input.tin.trim()} matches ${input.idType} ${input.idValue.trim()} in LHDN.` };
    if (res.status === 404) return { ok: true, valid: false, message: "LHDN did not match this TIN with the given ID." };
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string }; message?: string };
    return { ok: false, error: body.error?.message || body.message || `LHDN returned HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error calling LHDN TIN validation." };
  }
}

export async function submitDocumentToLhdn(
  creds: LhdnCredentials,
  env: MyInvoisEnv,
  input: { codeNumber: string; ublPayload: Record<string, unknown> },
): Promise<
  | {
      ok: true;
      accepted: boolean;
      submissionUid: string | null;
      uuid: string | null;
      rejectionReason: string | null;
    }
  | { ok: false; error: string }
> {
  const auth = await getLhdnAccessToken(creds, env);
  if (!auth.ok) return auth;

  const rawJson = JSON.stringify(input.ublPayload);
  const documentHash = createHash("sha256").update(rawJson, "utf8").digest("hex");
  const document = Buffer.from(rawJson, "utf8").toString("base64");

  try {
    const res = await fetch(`${API_BASE[env]}/api/v1.0/documentsubmissions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        documents: [{ format: "JSON", documentHash, codeNumber: input.codeNumber, document }],
      }),
    });

    const json = (await res.json().catch(() => ({}))) as {
      submissionUid?: string;
      acceptedDocuments?: Array<{ uuid?: string; invoiceCodeNumber?: string }>;
      rejectedDocuments?: Array<{
        invoiceCodeNumber?: string;
        error?: { message?: string; details?: Array<{ code?: string; message?: string }> };
      }>;
      error?: { message?: string };
      message?: string;
    };

    if (!res.ok && res.status !== 202) {
      return { ok: false, error: json.error?.message || json.message || `LHDN submission failed (HTTP ${res.status})` };
    }

    const accepted = json.acceptedDocuments?.[0];
    if (accepted?.uuid) {
      return {
        ok: true,
        accepted: true,
        submissionUid: json.submissionUid ?? null,
        uuid: accepted.uuid,
        rejectionReason: null,
      };
    }

    const rejected = json.rejectedDocuments?.[0];
    const details = rejected?.error?.details?.map((d) => [d.code, d.message].filter(Boolean).join(": ")).join("; ");
    return {
      ok: true,
      accepted: false,
      submissionUid: json.submissionUid ?? null,
      uuid: null,
      rejectionReason: details || rejected?.error?.message || "Document rejected by LHDN MyInvois.",
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error submitting document to LHDN." };
  }
}

export async function getLhdnDocumentDetails(
  creds: LhdnCredentials,
  env: MyInvoisEnv,
  uuid: string,
): Promise<
  | {
      ok: true;
      status: "pending" | "valid" | "rejected" | "cancelled";
      longId: string | null;
      validatedAt: string | null;
      rejectionReason: string | null;
    }
  | { ok: false; error: string }
> {
  const auth = await getLhdnAccessToken(creds, env);
  if (!auth.ok) return auth;

  try {
    const res = await fetch(`${API_BASE[env]}/api/v1.0/documents/${encodeURIComponent(uuid)}/details`, {
      method: "GET",
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    });
    const json = (await res.json().catch(() => ({}))) as {
      status?: string;
      longId?: string;
      dateTimeValidated?: string;
      validationResults?: {
        status?: string;
        validationSteps?: Array<{ status?: string; error?: { message?: string } }>;
      };
      error?: { message?: string };
    };
    if (!res.ok) {
      return { ok: false, error: json.error?.message || `LHDN status check failed (HTTP ${res.status})` };
    }

    const raw = (json.status ?? "").toLowerCase();
    const status: "pending" | "valid" | "rejected" | "cancelled" =
      raw === "valid" ? "valid" : raw === "invalid" ? "rejected" : raw === "cancelled" ? "cancelled" : "pending";
    const stepErr = json.validationResults?.validationSteps
      ?.filter((s) => s.status?.toLowerCase() === "invalid" && s.error?.message)
      .map((s) => s.error!.message!)
      .join("; ");

    return {
      ok: true,
      status,
      longId: json.longId ?? null,
      validatedAt: json.dateTimeValidated ?? null,
      rejectionReason: status === "rejected" ? stepErr || "Document failed LHDN validation." : null,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error checking LHDN document status." };
  }
}

export async function cancelLhdnDocument(
  creds: LhdnCredentials,
  env: MyInvoisEnv,
  input: { uuid: string; reason: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await getLhdnAccessToken(creds, env);
  if (!auth.ok) return auth;

  try {
    const res = await fetch(`${API_BASE[env]}/api/v1.0/documents/state/${encodeURIComponent(input.uuid)}/state`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "cancelled", reason: input.reason.trim() }),
    });
    if (res.ok) return { ok: true };
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string }; message?: string };
    return { ok: false, error: json.error?.message || json.message || `LHDN cancel failed (HTTP ${res.status})` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error cancelling document in LHDN." };
  }
}
