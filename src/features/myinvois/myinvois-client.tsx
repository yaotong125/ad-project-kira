"use client";

import { Check, Code2, Copy, ExternalLink, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/shared/ui/button";
import { Input, Select } from "@/shared/ui/form-controls";
import {
  cancelMyInvoisSubmissionAction,
  clearMyInvoisCredentialsAction,
  disableMyInvoisAction,
  saveMyInvoisCredentialsAction,
  submitInvoiceMyInvoisAction,
  syncMyInvoisStatusAction,
  testMyInvoisConnectionAction,
  validateTaxpayerTinAction,
  verifyMyInvoisSetupAction,
} from "./actions";
import { MYINVOIS_CHIP, type MyInvoisEnv, type MyInvoisStatus, type SubmissionSnapshot } from "./types";

export function MyInvoisSetupControls({
  orgSlug,
  enabled,
  initialEnv,
  verifiedAt,
  canAdmin,
}: {
  orgSlug: string;
  enabled: boolean;
  initialEnv: MyInvoisEnv;
  verifiedAt: string | null;
  canAdmin: boolean;
}) {
  const router = useRouter();
  const [env, setEnv] = useState<MyInvoisEnv>(initialEnv);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [pending, start] = useTransition();

  if (!canAdmin) {
    return (
      <p className="m-0 text-[12.5px] text-muted">
        Only an owner or admin can verify the MyInvois intermediary appointment.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-[220px]">
          <label htmlFor="mi-env" className="mb-1 block text-[12.5px] font-medium text-ink-2">
            Environment
          </label>
          <Select id="mi-env" value={env} onChange={(e) => setEnv(e.target.value as MyInvoisEnv)}>
            <option value="sandbox">Sandbox (LHDN pre-prod)</option>
            <option value="production">Production (Live LHDN)</option>
          </Select>
        </div>
        <Button
          type="button"
          size="sm"
          className="h-[34px]"
          disabled={pending}
          onClick={() => {
            setMsg(null);
            setErr(null);
            setMissing([]);
            start(async () => {
              const r = await verifyMyInvoisSetupAction(orgSlug, env);
              if (!r.ok) {
                setErr(r.error);
              } else if (!r.ready) {
                setMissing(r.missing);
                setErr("Complete the missing supplier profile fields in Settings, Profile first.");
              } else {
                setMsg(`MyInvois verified and enabled (${r.environment}).`);
                router.refresh();
              }
            });
          }}
        >
          {pending ? "Verifying..." : enabled ? "Re-verify appointment" : "Verify appointment"}
        </Button>
        {enabled && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-[34px]"
            disabled={pending}
            onClick={() => {
              setMsg(null);
              setErr(null);
              start(async () => {
                const r = await disableMyInvoisAction(orgSlug);
                if (r.ok) {
                  setMsg("MyInvois switched off.");
                  router.refresh();
                } else {
                  setErr(r.error);
                }
              });
            }}
          >
            Disable
          </Button>
        )}
      </div>
      {verifiedAt && enabled && (
        <p className="m-0 text-[12px] text-muted">
          Verified on <span className="num text-ink">{verifiedAt.slice(0, 10)}</span>.
        </p>
      )}
      {msg && (
        <p role="status" data-testid="mi-setup-status" className="m-0 text-[12.5px] font-medium text-positive">
          {msg}
        </p>
      )}
      {err && (
        <div role="alert" data-testid="mi-setup-error" className="text-[12.5px] text-negative">
          <p className="m-0">{err}</p>
          {missing.length > 0 && (
            <ul className="m-0 mt-1 list-disc pl-5">
              {missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function MyInvoisRowActions({
  orgSlug,
  invoiceId,
  invoiceNumber,
  status,
  enabled,
  canEdit,
  latest,
}: {
  orgSlug: string;
  invoiceId: string;
  invoiceNumber: string;
  status: MyInvoisStatus;
  enabled: boolean;
  canEdit: boolean;
  latest: SubmissionSnapshot | null;
}) {
  const router = useRouter();
  const [showJson, setShowJson] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const canSubmit = canEdit && enabled && (status === "not_submitted" || status === "rejected" || status === "cancelled");

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
        {latest?.lhdnUuid && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label={copied ? `Copied LHDN UUID for ${invoiceNumber}` : `Copy LHDN UUID for ${invoiceNumber}`}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(latest.lhdnUuid!);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
            {copied ? "Copied UUID" : "UUID"}
          </Button>
        )}
        {latest?.lhdnUuid && latest.longId && (
          <a
            href={`https://${latest.environment === "production" ? "myinvois" : "preprod.myinvois"}.hasil.gov.my/${encodeURIComponent(latest.lhdnUuid)}/share/${encodeURIComponent(latest.longId)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-[var(--radius)] px-2 py-1 text-[11.5px] font-medium text-brand hover:bg-surface-2"
          >
            <ExternalLink size={12} aria-hidden="true" /> LHDN portal
          </a>
        )}
        {canEdit && latest?.lhdnUuid && (status === "pending" || status === "valid") && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setErr(null);
              start(async () => {
                const r = await syncMyInvoisStatusAction(orgSlug, latest.id, invoiceId);
                if (r.ok) router.refresh();
                else setErr(r.error);
              });
            }}
          >
            <RefreshCw size={12} aria-hidden="true" /> Sync
          </Button>
        )}
        {latest && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label={showJson ? `Hide JSON for ${invoiceNumber}` : `Preview JSON for ${invoiceNumber}`}
            onClick={() => setShowJson((v) => !v)}
          >
            <Code2 size={12} aria-hidden="true" /> {showJson ? "Hide JSON" : "JSON"}
          </Button>
        )}
        {canSubmit && (
          <Button
            type="button"
            size="sm"
            variant={status === "rejected" ? "secondary" : "primary"}
            disabled={pending}
            onClick={() => {
              setErr(null);
              start(async () => {
                const r = await submitInvoiceMyInvoisAction(orgSlug, invoiceId);
                if (r.ok) {
                  router.refresh();
                } else {
                  setErr(r.error);
                }
              });
            }}
          >
            {pending
              ? status === "rejected"
                ? "Retrying..."
                : "Submitting..."
              : status === "rejected"
                ? "Retry submission"
                : "Submit to MyInvois"}
          </Button>
        )}
        {canEdit && status === "valid" && latest && !cancelling && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setCancelling(true)}>
            Cancel
          </Button>
        )}
      </div>

      {cancelling && latest && (
        <div className="flex flex-wrap items-center justify-end gap-1.5 rounded-[var(--radius)] border border-border bg-surface-2 p-2">
          <div className="w-[180px]">
            <Input
              aria-label={`Cancel reason for ${invoiceNumber}`}
              placeholder="Cancellation reason"
              className="h-[28px] text-[12px]"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending || reason.trim().length < 2}
            onClick={() => {
              setErr(null);
              start(async () => {
                const r = await cancelMyInvoisSubmissionAction(orgSlug, latest.id, invoiceId, reason);
                if (r.ok) {
                  setCancelling(false);
                  setReason("");
                  router.refresh();
                } else {
                  setErr(r.error);
                }
              });
            }}
          >
            {pending ? "Cancelling..." : "Confirm cancel"}
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setCancelling(false)}>
            Keep
          </Button>
        </div>
      )}

      {err && (
        <span role="alert" className="text-[11.5px] text-negative">
          {err}
        </span>
      )}

      {showJson && latest && (
        <pre
          data-testid="myinvois-json-preview"
          className="m-0 max-h-[260px] w-full max-w-[540px] overflow-auto rounded-[var(--radius)] border border-border bg-surface-2 p-3 text-left font-mono text-[11px] leading-relaxed text-ink"
        >
          {JSON.stringify(latest.payload, null, 2)}
        </pre>
      )}
    </div>
  );
}

/** Embedded MyInvois (e-Invoice) card shown on recorded Invoice detail pages. */
export function InvoiceMyInvoisPanel({
  orgSlug,
  invoiceId,
  invoiceNumber,
  enabled,
  environment,
  canEdit,
  latest,
}: {
  orgSlug: string;
  invoiceId: string;
  invoiceNumber: string;
  enabled: boolean;
  environment: MyInvoisEnv;
  canEdit: boolean;
  latest: SubmissionSnapshot | null;
}) {
  const base = `/${orgSlug}`;
  const status: MyInvoisStatus = latest ? latest.status : "not_submitted";
  const [chip, label] = MYINVOIS_CHIP[status];

  return (
    <section
      className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4"
      data-testid="invoice-myinvois"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="m-0 text-[13.5px] font-semibold text-ink">MyInvois (e-Invoice)</h2>
          <span className={chip}>{label}</span>
          {enabled && <span className="chip">{environment === "production" ? "Production" : "Sandbox"}</span>}
        </div>
        <MyInvoisRowActions
          orgSlug={orgSlug}
          invoiceId={invoiceId}
          invoiceNumber={invoiceNumber}
          status={status}
          enabled={enabled}
          canEdit={canEdit}
          latest={latest}
        />
      </div>

      {!enabled ? (
        <p className="m-0 text-[12.5px] text-muted">
          MyInvois is not configured yet.{" "}
          <Link href={`${base}/settings/e-invoice`} className="font-medium text-brand hover:underline">
            Fix in Settings
          </Link>
        </p>
      ) : status === "valid" && latest ? (
        <p className="m-0 text-[12.5px] text-ink-2">
          Submitted and validated by LHDN. UUID:{" "}
          <code className="num text-[12px] text-ink">{latest.lhdnUuid}</code>
        </p>
      ) : status === "rejected" && latest ? (
        <p className="m-0 text-[12.5px] text-negative">
          Submitted, but rejected by LHDN: {latest.rejectionReason ?? "Validation failed."}
        </p>
      ) : status === "cancelled" && latest ? (
        <p className="m-0 text-[12.5px] text-muted">
          Cancelled ({latest.cancelReason}). You can resubmit if needed.
        </p>
      ) : (
        <p className="m-0 text-[12.5px] text-muted">
          Ready to submit to LHDN MyInvois ({environment}). Track all submissions in{" "}
          <Link href={`${base}/myinvois`} className="font-medium text-brand hover:underline">
            e-Invois
          </Link>
          .
        </p>
      )}
    </section>
  );
}

export function MyInvoisCredentialsCard({
  orgSlug,
  apiMode,
  initialClientId,
  clientSecretHint,
  initialOnBehalfOf,
  encryptionReady,
  canAdmin,
}: {
  orgSlug: string;
  apiMode: "live_org" | "live_env" | "simulation";
  initialClientId: string | null;
  clientSecretHint: string | null;
  initialOnBehalfOf: string | null;
  encryptionReady: boolean;
  canAdmin: boolean;
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState(initialClientId ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [onBehalfOf, setOnBehalfOf] = useState(initialOnBehalfOf ?? "");
  const [tin, setTin] = useState("");
  const [idType, setIdType] = useState<"BRN" | "NRIC" | "PASSPORT" | "ARMY">("BRN");
  const [idValue, setIdValue] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tinMsg, setTinMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="m-0 text-[14px] font-semibold text-ink">3. LHDN API credentials (OAuth 2.0)</h2>
          <p className="m-0 mt-1 text-[12.5px] text-muted">
            Connect directly to LHDN&apos;s MyInvois REST API (<code className="num text-[12px]">/connect/token</code> &amp;{" "}
            <code className="num text-[12px]">/api/v1.0/documentsubmissions</code>). Leave blank to stay in Sandbox simulation mode.
          </p>
        </div>
        <span className={apiMode === "simulation" ? "chip" : "chip pos"} data-testid="mi-api-mode">
          {apiMode === "live_org"
            ? "Live API (org credentials)"
            : apiMode === "live_env"
              ? "Live API (platform env)"
              : "Sandbox simulation"}
        </span>
      </div>

      {!encryptionReady && apiMode !== "live_env" && (
        <p className="m-0 rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2 text-[12px] text-muted">
          To store per-organisation client secrets securely in Postgres (AES-256-GCM), set{" "}
          <code className="num text-ink">MYINVOIS_ENCRYPTION_KEY</code> in your server environment, or set platform-wide{" "}
          <code className="num text-ink">MYINVOIS_CLIENT_ID</code> &amp;{" "}
          <code className="num text-ink">MYINVOIS_CLIENT_SECRET</code>.
        </p>
      )}

      {canAdmin ? (
        <form
          className="grid grid-cols-1 gap-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            setMsg(null);
            setErr(null);
            start(async () => {
              const r = await saveMyInvoisCredentialsAction(orgSlug, { clientId, clientSecret, onBehalfOf });
              if (r.ok) {
                setClientSecret("");
                setMsg("LHDN MyInvois credentials saved.");
                router.refresh();
              } else {
                setErr(r.error);
              }
            });
          }}
        >
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="mi-cid" className="text-[12.5px] font-medium text-ink-2">
              ERP Client ID<span className="ml-0.5 text-negative">*</span>
            </label>
            <Input
              id="mi-cid"
              required
              placeholder="From MyInvois Portal → ERP Integration"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="mi-csec" className="text-[12.5px] font-medium text-ink-2">
              Client Secret {clientSecretHint ? `(saved ${clientSecretHint})` : ""}
            </label>
            <Input
              id="mi-csec"
              type="password"
              placeholder={clientSecretHint ? "Leave blank to keep existing" : "Enter LHDN client secret"}
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="mi-obo" className="text-[12.5px] font-medium text-ink-2">
              On-behalf-of TIN (optional)
            </label>
            <Input
              id="mi-obo"
              placeholder="Intermediary TIN if applicable"
              value={onBehalfOf}
              onChange={(e) => setOnBehalfOf(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1 sm:col-span-3">
            <Button type="submit" size="sm" className="h-[32px]" disabled={pending}>
              {pending ? "Saving..." : "Save credentials"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-[32px]"
              disabled={pending}
              onClick={() => {
                setMsg(null);
                setErr(null);
                start(async () => {
                  const r = await testMyInvoisConnectionAction(orgSlug);
                  if (r.ok) setMsg(r.message);
                  else setErr(r.error);
                });
              }}
            >
              Test LHDN connection
            </Button>
            {initialClientId && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-[32px]"
                disabled={pending}
                onClick={() => {
                  setMsg(null);
                  setErr(null);
                  start(async () => {
                    const r = await clearMyInvoisCredentialsAction(orgSlug);
                    if (r.ok) {
                      setClientId("");
                      setClientSecret("");
                      setOnBehalfOf("");
                      setMsg("Credentials cleared. Reverted to sandbox simulation.");
                      router.refresh();
                    } else {
                      setErr(r.error);
                    }
                  });
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </form>
      ) : (
        <p className="m-0 text-[12.5px] text-muted">Only an owner or admin can manage LHDN API credentials.</p>
      )}

      {msg && <p role="status" className="m-0 text-[12.5px] font-medium text-positive">{msg}</p>}
      {err && <p role="alert" className="m-0 text-[12.5px] text-negative">{err}</p>}

      <div className="border-t border-border pt-3">
        <div className="text-[12.5px] font-medium text-ink">Quick live TIN check</div>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_130px_1fr_auto] sm:items-end">
          <Input
            aria-label="Taxpayer TIN"
            placeholder="e.g. C25845632020"
            value={tin}
            onChange={(e) => setTin(e.target.value)}
          />
          <Select aria-label="ID type" value={idType} onChange={(e) => setIdType(e.target.value as typeof idType)}>
            <option value="BRN">BRN</option>
            <option value="NRIC">NRIC</option>
            <option value="PASSPORT">Passport</option>
            <option value="ARMY">Army</option>
          </Select>
          <Input
            aria-label="ID value"
            placeholder="e.g. 202001012345"
            value={idValue}
            onChange={(e) => setIdValue(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-[34px]"
            disabled={pending}
            onClick={() => {
              setTinMsg(null);
              start(async () => {
                const r = await validateTaxpayerTinAction(orgSlug, { tin, idType, idValue });
                if (r.ok) setTinMsg({ ok: r.valid, text: r.message });
                else setTinMsg({ ok: false, text: r.error });
              });
            }}
          >
            Validate TIN
          </Button>
        </div>
        {tinMsg && (
          <p role="status" className={`m-0 mt-2 text-[12.5px] font-medium ${tinMsg.ok ? "text-positive" : "text-negative"}`}>
            {tinMsg.text}
          </p>
        )}
      </div>
    </section>
  );
}
