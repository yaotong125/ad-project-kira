"use client";

import { Check, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/shared/ui/button";
import { Input, Select } from "@/shared/ui/form-controls";
import {
  changePasswordAction,
  clearAiMemoryAction,
  createApiKeyAction,
  createWebhookAction,
  deleteOrganizationAction,
  deleteWebhookAction,
  revokeApiKeyAction,
  runOrgAutomationsNowAction,
  saveLanguageAction,
  setAiMemoryAction,
  setAutoRunEnabledAction,
  setRequireMfaAction,
  toggleWebhookAction,
} from "./actions";
import { WEBHOOK_EVENTS, type ApiKeyScope, type AutomationRunRow } from "./types";

export function CreateApiKeyForm({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [scope, setScope] = useState<ApiKeyScope>("read");
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-5">
      <h2 className="m-0 text-[14px] font-semibold text-ink">Mint an API key</h2>
      <p className="m-0 mt-1 text-[12.5px] text-muted">
        Create a key to use the REST API or connect an external integration. The full key is shown once.
      </p>
      <form
        className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          setErr(null);
          setSecret(null);
          setCopied(false);
          start(async () => {
            const r = await createApiKeyAction(orgSlug, name, scope);
            if (r.ok) {
              setSecret(r.secret);
              setName("");
              router.refresh();
            } else {
              setErr(r.error);
            }
          });
        }}
      >
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="ak-name" className="text-[12.5px] font-medium text-ink-2">
            Key name<span className="ml-0.5 text-negative">*</span>
          </label>
          <Input id="ak-name" required placeholder="e.g. POS sync or Reporting script" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="ak-scope" className="text-[12.5px] font-medium text-ink-2">Scope</label>
          <Select id="ak-scope" value={scope} onChange={(e) => setScope(e.target.value as ApiKeyScope)}>
            <option value="read">Read only</option>
            <option value="write">Read &amp; write</option>
          </Select>
        </div>
        <Button type="submit" size="sm" className="h-[34px]" disabled={pending}>
          {pending ? "Creating..." : "Create API key"}
        </Button>
      </form>
      {err && <p role="alert" className="m-0 mt-2 text-[12.5px] text-negative">{err}</p>}
      {secret && (
        <div
          role="status"
          data-testid="api-key-secret"
          className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2.5 text-[12.5px]"
        >
          <div className="min-w-0">
            <div className="font-medium text-ink">Copy this key now — you will not be able to see it again.</div>
            <code className="num mt-0.5 block break-all text-[12px] text-brand">{secret}</code>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(secret);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
            {copied ? "Copied" : "Copy key"}
          </Button>
        </div>
      )}
    </section>
  );
}

export function RevokeApiKeyButton({ orgSlug, id }: { orgSlug: string; id: string }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="inline-flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => {
          setErr(null);
          start(async () => {
            const r = await revokeApiKeyAction(orgSlug, id);
            if (r.ok) router.refresh();
            else setErr(r.error);
          });
        }}
      >
        {pending ? "Revoking..." : "Revoke"}
      </Button>
      {err && <span role="alert" className="text-[11px] text-negative">{err}</span>}
    </div>
  );
}

export function CreateWebhookForm({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["invoice.recorded"]);
  const [secret, setSecret] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggleEv = (id: string) =>
    setEvents((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-5">
      <h2 className="m-0 text-[14px] font-semibold text-ink">Add a webhook endpoint</h2>
      <p className="m-0 mt-1 text-[12.5px] text-muted">
        Kira sends signed JSON POST notifications when selected events happen in your books.
      </p>
      <form
        className="mt-4 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setErr(null);
          setSecret(null);
          start(async () => {
            const r = await createWebhookAction(orgSlug, url, events);
            if (r.ok) {
              setSecret(r.secret);
              setUrl("");
              router.refresh();
            } else {
              setErr(r.error);
            }
          });
        }}
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="wh-url" className="text-[12.5px] font-medium text-ink-2">
            Endpoint URL<span className="ml-0.5 text-negative">*</span>
          </label>
          <Input id="wh-url" type="url" required placeholder="https://api.example.com/webhooks/kira" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-1.5 text-[12.5px] font-medium text-ink-2">Events</legend>
          <div className="flex flex-wrap gap-3 text-[12.5px]">
            {WEBHOOK_EVENTS.map((ev) => (
              <label key={ev.id} className="inline-flex cursor-pointer items-center gap-1.5 text-ink">
                <input
                  type="checkbox"
                  className="accent-brand"
                  checked={events.includes(ev.id)}
                  onChange={() => toggleEv(ev.id)}
                />
                {ev.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="text-[12.5px]">{err && <span role="alert" className="text-negative">{err}</span>}</div>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Adding..." : "Add webhook"}
          </Button>
        </div>
      </form>
      {secret && (
        <div role="status" data-testid="webhook-secret" className="mt-3 rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2 text-[12.5px]">
          Signing secret (shown once): <code className="num text-brand">{secret}</code>
        </div>
      )}
    </section>
  );
}

export function WebhookRowActions({ orgSlug, id, enabled }: { orgSlug: string; id: string; enabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="inline-flex items-center gap-1.5">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await toggleWebhookAction(orgSlug, id, !enabled);
            router.refresh();
          })
        }
      >
        {enabled ? "Disable" : "Enable"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await deleteWebhookAction(orgSlug, id);
            router.refresh();
          })
        }
      >
        Delete
      </Button>
    </div>
  );
}

export function AiMemoryControls({
  orgSlug,
  initialEnabled,
  chatCount,
  canAdmin,
}: {
  orgSlug: string;
  initialEnabled: boolean;
  chatCount: number;
  canAdmin: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [confirmClear, setConfirmClear] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[13px] font-medium text-ink">Kira remembers past chats</div>
          <div className="text-[12px] text-muted">
            {enabled
              ? `On · ${chatCount} saved chat ${chatCount === 1 ? "conversation" : "conversations"}.`
              : "Memory is off. Kira keeps stored summaries but does not add to them."}
          </div>
        </div>
        {canAdmin ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              const next = !enabled;
              setMsg(null);
              setErr(null);
              start(async () => {
                const r = await setAiMemoryAction(orgSlug, next);
                if (r.ok) {
                  setEnabled(next);
                  setMsg(next ? "Kira memory turned on." : "Kira memory turned off.");
                  router.refresh();
                } else {
                  setErr(r.error);
                }
              });
            }}
          >
            {enabled ? "Turn off" : "Turn on"}
          </Button>
        ) : (
          <span className="text-[12px] text-muted">Only an owner or admin can turn memory on or off.</span>
        )}
      </div>

      {canAdmin && (
        <div className="border-t border-border pt-3">
          {!confirmClear ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmClear(true)}>
              Clear all memory
            </Button>
          ) : (
            <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-border bg-surface-2 p-3 text-[12.5px]">
              <span className="text-ink-2">
                This deletes every Ask Kira chat summary in this organisation. You cannot undo this.
              </span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() => {
                  setMsg(null);
                  setErr(null);
                  start(async () => {
                    const r = await clearAiMemoryAction(orgSlug);
                    if (r.ok) {
                      setConfirmClear(false);
                      setMsg("All memory is deleted.");
                      router.refresh();
                    } else {
                      setErr(r.error);
                    }
                  });
                }}
              >
                Delete all memory
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setConfirmClear(false)}>
                Cancel
              </Button>
            </div>
          )}
        </div>
      )}

      {msg && <p role="status" data-testid="ai-memory-status" className="m-0 text-[12.5px] font-medium text-positive">{msg}</p>}
      {err && <p role="alert" className="m-0 text-[12.5px] text-negative">{err}</p>}
    </div>
  );
}

export function DeleteOrgDangerZone({
  orgSlug,
  legalName,
  isOwner,
}: {
  orgSlug: string;
  legalName: string;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!isOwner) {
    return (
      <p className="m-0 text-[12.5px] text-muted">
        Only the organisation owner can permanently delete {legalName}.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-[12.5px] leading-relaxed text-ink-2">
        This removes the books, documents, members, and history permanently. Export your data first, because Malaysian
        tax law generally requires you to keep records for 7 years.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[260px] flex-1">
          <label htmlFor="del-org-confirm" className="mb-1 block text-[12.5px] font-medium text-ink-2">
            Type <strong className="text-ink">{legalName}</strong> to confirm
          </label>
          <Input
            id="del-org-confirm"
            placeholder={legalName}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-[34px] text-negative"
          disabled={pending || confirmText.trim() !== legalName}
          onClick={() => {
            setErr(null);
            start(async () => {
              const r = await deleteOrganizationAction(orgSlug, confirmText);
              if (r.ok) {
                router.push("/dashboard");
                router.refresh();
              } else {
                setErr(r.error);
              }
            });
          }}
        >
          {pending ? "Deleting..." : "Permanently delete this organisation"}
        </Button>
      </div>
      {err && <p role="alert" className="m-0 text-[12.5px] text-negative">{err}</p>}
    </div>
  );
}

export function LanguagePreferenceForm({ orgSlug, initialLang }: { orgSlug: string; initialLang: "en" | "ms" }) {
  const router = useRouter();
  const [lang, setLang] = useState<"en" | "ms">(initialLang);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        setErr(null);
        start(async () => {
          const r = await saveLanguageAction(orgSlug, lang);
          if (r.ok) {
            setMsg(lang === "ms" ? "Bahasa disimpan" : "Language saved");
            router.refresh();
          } else {
            setErr(r.error);
          }
        });
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-[240px]">
          <label htmlFor="pref-lang" className="mb-1 block text-[12.5px] font-medium text-ink-2">
            Display language
          </label>
          <Select id="pref-lang" value={lang} onChange={(e) => setLang(e.target.value as "en" | "ms")}>
            <option value="en">English</option>
            <option value="ms">Bahasa Malaysia</option>
          </Select>
        </div>
        <Button type="submit" size="sm" className="h-[34px]" disabled={pending}>
          {pending ? "Saving..." : "Save"}
        </Button>
      </div>
      {msg && <p role="status" data-testid="lang-saved" className="m-0 text-[12.5px] font-medium text-positive">{msg}</p>}
      {err && <p role="alert" className="m-0 text-[12.5px] text-negative">{err}</p>}
    </form>
  );
}

export function ChangePasswordForm() {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        setErr(null);
        start(async () => {
          const r = await changePasswordAction(pw, confirm);
          if (r.ok) {
            setMsg("Password updated.");
            setPw("");
            setConfirm("");
          } else {
            setErr(r.error);
          }
        });
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="sec-pw" className="text-[12.5px] font-medium text-ink-2">New password</label>
          <Input id="sec-pw" type="password" minLength={8} required placeholder="At least 8 characters" value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="sec-pw2" className="text-[12.5px] font-medium text-ink-2">Confirm new password</label>
          <Input id="sec-pw2" type="password" minLength={8} required placeholder="Repeat password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[12.5px]">
          {msg && <span role="status" className="font-medium text-positive">{msg}</span>}
          {err && <span role="alert" className="text-negative">{err}</span>}
        </div>
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {pending ? "Updating..." : "Update password"}
        </Button>
      </div>
    </form>
  );
}

export function MfaEnforcementToggle({
  orgSlug,
  initialRequired,
  isOwner,
}: {
  orgSlug: string;
  initialRequired: boolean;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [required, setRequired] = useState(initialRequired);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
      <div>
        <div className="text-[13px] font-medium text-ink">Require 2FA for owners and admins</div>
        <div className="text-[12px] text-muted">
          Viewers and bookkeepers are never required to set up 2FA, though anyone can choose to.
        </div>
        {msg && <div role="status" className="mt-1 text-[12px] font-medium text-positive">{msg}</div>}
      </div>
      {isOwner ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => {
            const next = !required;
            setMsg(null);
            start(async () => {
              const r = await setRequireMfaAction(orgSlug, next);
              if (r.ok) {
                setRequired(next);
                setMsg(next ? "2FA enforcement turned on." : "2FA enforcement turned off.");
                router.refresh();
              }
            });
          }}
        >
          {required ? "Turn off" : "Turn on"}
        </Button>
      ) : (
        <span className="chip">{required ? "Required" : "Optional"}</span>
      )}
    </div>
  );
}

export function ScheduledAutomationsControls({
  orgSlug,
  initialEnabled,
  runs,
  canAdmin,
  canRun,
}: {
  orgSlug: string;
  initialEnabled: boolean;
  runs: AutomationRunRow[];
  canAdmin: boolean;
  canRun: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[13px] font-medium text-ink">Daily background run (01:00 MYT)</div>
          <div className="text-[12px] text-muted">
            {enabled
              ? "On · Automatically posts due recurring invoices, recurring bills, monthly depreciation, and auto-post prepaids."
              : "Paused · Scheduled cron skips this organisation until you turn it back on."}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canRun && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                setMsg(null);
                setErr(null);
                start(async () => {
                  const r = await runOrgAutomationsNowAction(orgSlug);
                  if (r.ok) {
                    setMsg(
                      `Ran automations: ${r.invoicesGenerated} invoice${r.invoicesGenerated === 1 ? "" : "s"}, ${r.billsGenerated} bill${r.billsGenerated === 1 ? "" : "s"}, ${r.depreciationPosted} depreciation, ${r.prepaidsPosted} prepaid posted.`,
                    );
                    router.refresh();
                  } else {
                    setErr(r.error);
                  }
                });
              }}
            >
              {pending ? "Running..." : "Run due now"}
            </Button>
          )}
          {canAdmin ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                const next = !enabled;
                setMsg(null);
                setErr(null);
                start(async () => {
                  const r = await setAutoRunEnabledAction(orgSlug, next);
                  if (r.ok) {
                    setEnabled(next);
                    setMsg(next ? "Daily scheduled automations turned on." : "Daily scheduled automations paused.");
                    router.refresh();
                  } else {
                    setErr(r.error);
                  }
                });
              }}
            >
              {enabled ? "Pause schedule" : "Turn on"}
            </Button>
          ) : (
            <span className="chip">{enabled ? "Scheduled" : "Paused"}</span>
          )}
        </div>
      </div>

      {msg && (
        <p role="status" data-testid="automation-status" className="m-0 text-[12.5px] font-medium text-positive">
          {msg}
        </p>
      )}
      {err && (
        <p role="alert" className="m-0 text-[12.5px] text-negative">
          {err}
        </p>
      )}

      {runs.length > 0 && (
        <div className="mt-1 overflow-x-auto rounded-[var(--radius)] border border-border">
          <table className="w-full border-collapse text-left text-[12.5px]" data-testid="automation-runs-table">
            <thead>
              <tr className="bg-surface-2/60 text-[11px] font-semibold tracking-[0.04em] text-muted uppercase">
                <th className="px-3 py-2">As of</th>
                <th className="px-3 py-2">Trigger</th>
                <th className="px-3 py-2 text-right">Invoices</th>
                <th className="px-3 py-2 text-right">Bills</th>
                <th className="px-3 py-2 text-right">Depreciation</th>
                <th className="px-3 py-2 text-right">Prepaids</th>
                <th className="px-3 py-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2 whitespace-nowrap num text-ink">{r.asOfDate}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="chip">{r.triggerSource === "cron" ? "Cron" : "Manual"}</span>
                  </td>
                  <td className="px-3 py-2 text-right num text-ink">{r.invoicesGenerated}</td>
                  <td className="px-3 py-2 text-right num text-ink">{r.billsGenerated}</td>
                  <td className="px-3 py-2 text-right num text-ink">{r.depreciationPosted}</td>
                  <td className="px-3 py-2 text-right num text-ink">{r.prepaidsPosted}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <span className={r.status === "ok" ? "chip pos" : r.status === "partial" ? "chip warn" : "chip neg"}>
                      {r.status === "ok" ? "OK" : r.status === "partial" ? "Partial" : "Failed"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
