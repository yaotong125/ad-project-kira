"use client";

import { Check, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/shared/ui/button";
import { Input, Select } from "@/shared/ui/form-controls";
import {
  acceptInviteAction,
  changeMemberRoleAction,
  inviteMemberAction,
  removeMemberAction,
  revokeInviteAction,
} from "./actions";
import { ASSIGNABLE_ROLES, ROLE_META, type AssignableRole } from "./types";

export function InviteMemberForm({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AssignableRole>("member");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    email: string;
    token: string;
    role: AssignableRole;
    emailStatus: "sent" | "skipped" | "failed";
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  return (
    <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-5">
      <h2 className="m-0 text-[14px] font-semibold text-ink">Invite a member</h2>
      <p className="m-0 mt-1 text-[12.5px] text-muted">
        Enter their email and pick a role. Share the invite link so they can accept with their own account.
      </p>

      <form
        className="mt-4 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setCreated(null);
          setCopied(false);
          start(async () => {
            const r = await inviteMemberAction(orgSlug, email, role);
            if (r.ok) {
              setCreated({ email: r.email, token: r.token, role: r.role, emailStatus: r.emailStatus });
              setEmail("");
              router.refresh();
            } else {
              setError(r.error);
            }
          });
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end">
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="inv-email" className="text-[12.5px] font-medium text-ink-2">
              Email address<span className="ml-0.5 text-negative" aria-hidden="true">*</span>
            </label>
            <Input
              id="inv-email"
              type="email"
              required
              placeholder="accountant@firm.com.my"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="inv-role" className="text-[12.5px] font-medium text-ink-2">
              Role<span className="ml-0.5 text-negative" aria-hidden="true">*</span>
            </label>
            <Select
              id="inv-role"
              value={role}
              onChange={(e) => setRole(e.target.value as AssignableRole)}
            >
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_META[r].label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Button type="submit" size="sm" disabled={pending} className="h-[34px] w-full sm:w-auto">
              {pending ? "Sending..." : "Send invite"}
            </Button>
          </div>
        </div>

        <p className="m-0 text-[12px] text-muted" data-testid="invite-role-hint">
          <strong className="font-medium text-ink-2">{ROLE_META[role].label}:</strong> {ROLE_META[role].summary}
        </p>

        {error && (
          <p role="alert" className="m-0 text-[12.5px] text-negative">
            {error}
          </p>
        )}

        {created && (
          <div
            role="status"
            data-testid="invite-created"
            className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2.5 text-[12.5px]"
          >
            <span className="text-ink">
              {created.emailStatus === "sent" ? "Invitation emailed to " : "Invited "}
              <strong>{created.email}</strong> as{" "}
              <strong>{ROLE_META[created.role].label}</strong>. Share link:{" "}
              <code className="num text-[12px] text-brand">/invite/{created.token}</code>
            </span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={async () => {
                const url = `${window.location.origin}/invite/${created.token}`;
                try {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
        )}
      </form>
    </section>
  );
}

export function MemberRoleSelect({
  orgSlug,
  userId,
  email,
  initialRole,
}: {
  orgSlug: string;
  userId: string;
  email: string;
  initialRole: AssignableRole;
}) {
  const router = useRouter();
  const [role, setRole] = useState<AssignableRole>(initialRole);
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="inline-flex flex-col gap-1">
      <Select
        aria-label={`Role for ${email}`}
        value={role}
        disabled={pending}
        className="h-[30px] w-[140px] text-[12.5px]"
        onChange={(e) => {
          const next = e.target.value as AssignableRole;
          setRole(next);
          setStatus(null);
          setErr(null);
          start(async () => {
            const r = await changeMemberRoleAction(orgSlug, userId, next);
            if (r.ok) {
              setStatus("Saved");
              router.refresh();
            } else {
              setRole(initialRole);
              setErr(r.error);
            }
          });
        }}
      >
        {ASSIGNABLE_ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_META[r].label}
          </option>
        ))}
      </Select>
      {status && <span className="text-[11px] font-medium text-positive">{status}</span>}
      {err && (
        <span role="alert" className="text-[11px] text-negative">
          {err}
        </span>
      )}
    </div>
  );
}

export function RemoveMemberButton({
  orgSlug,
  userId,
  email,
}: {
  orgSlug: string;
  userId: string;
  email: string;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!confirm) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-label={`Remove ${email}`}
        onClick={() => setConfirm(true)}
      >
        Remove
      </Button>
    );
  }
  return (
    <div className="inline-flex flex-col items-end gap-1">
      <div className="inline-flex items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => {
            setErr(null);
            start(async () => {
              const r = await removeMemberAction(orgSlug, userId);
              if (r.ok) {
                setConfirm(false);
                router.refresh();
              } else {
                setErr(r.error);
              }
            });
          }}
        >
          {pending ? "Removing..." : "Confirm remove"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setConfirm(false)}>
          Cancel
        </Button>
      </div>
      {err && (
        <span role="alert" className="text-[11.5px] text-negative">
          {err}
        </span>
      )}
    </div>
  );
}

export function InviteRowActions({
  orgSlug,
  inviteId,
  token,
  email,
}: {
  orgSlug: string;
  inviteId: string;
  token: string;
  email: string;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <div className="inline-flex items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          aria-label={`Copy invite link for ${email}`}
          onClick={async () => {
            const url = `${window.location.origin}/invite/${token}`;
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
          {copied ? "Copied" : "Copy link"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          aria-label={`Revoke invite for ${email}`}
          onClick={() => {
            setErr(null);
            start(async () => {
              const r = await revokeInviteAction(orgSlug, inviteId);
              if (r.ok) router.refresh();
              else setErr(r.error);
            });
          }}
        >
          {pending ? "Revoking..." : "Revoke"}
        </Button>
      </div>
      {err && (
        <span role="alert" className="text-[11.5px] text-negative">
          {err}
        </span>
      )}
    </div>
  );
}

export function AcceptInviteControl({ token }: { token: string }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        disabled={pending}
        className="w-full"
        onClick={() => {
          setErr(null);
          start(async () => {
            const r = await acceptInviteAction(token);
            if (r.ok) {
              router.push(`/${r.slug}`);
              router.refresh();
            } else {
              setErr(r.error);
            }
          });
        }}
      >
        {pending ? "Joining..." : "Accept invitation"}
      </Button>
      {err && (
        <p role="alert" className="m-0 text-center text-[12.5px] text-negative">
          {err}
        </p>
      )}
    </div>
  );
}
