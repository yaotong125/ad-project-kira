import { CircleHelp } from "lucide-react";
import Link from "next/link";
import { SettingsHeader } from "@/features/settings/settings-header";
import type { OrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { AuthCard } from "@/shared/ui/auth-card";
import { buttonClass } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";
import { KiraLogo } from "@/shared/ui/kira-logo";
import { loadActivityData, loadInvitePreview, loadTeamData } from "./load";
import {
  AcceptInviteControl,
  InviteMemberForm,
  InviteRowActions,
  MemberRoleSelect,
  RemoveMemberButton,
} from "./team-client";
import { ROLE_META, type AssignableRole, type TeamRole } from "./types";

const TH = "border-b border-border px-[var(--pad-x)] py-2 text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted";
const TD = "h-[var(--row-h)] border-b border-border px-[var(--pad-x)] align-middle";
const SUB = "shrink-0 whitespace-nowrap rounded-[7px] px-2.5 py-1 text-[12px] font-medium transition-colors";

const SUB_TABS = [
  { key: "members", href: "settings/team", label: "Members" },
  { key: "activity", href: "settings/activity", label: "Activity" },
] as const;

function shortDate(iso: string) {
  return iso ? iso.slice(0, 10) : "–";
}

function shortDateTime(iso: string) {
  if (!iso) return "–";
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

/** /{slug}/settings/team: Members & roles (lejar.ai Settings -> Team & activity). */
export async function TeamSettingsPage({ ctx }: { ctx: OrgContext }) {
  const supabase = await createSupabaseServerClient();
  const data = await loadTeamData(supabase, ctx.org.id, ctx.org.slug);
  const base = `/${ctx.org.slug}`;
  const canManage = ctx.role === "owner" || ctx.role === "admin";
  const ms = ctx.lang === "ms";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col">
        <SettingsHeader
          base={base}
          legalName={ctx.org.legal_name}
          sub={ms ? "Ahli" : "Members"}
          active="team"
        />
        <div className="flex gap-1 overflow-x-auto pt-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SUB_TABS.map((t) => (
            <Link
              key={t.key}
              aria-current={t.key === "members" ? "page" : undefined}
              href={`${base}/${t.href}`}
              className={cn(
                SUB,
                t.key === "members" ? "bg-surface-2 text-ink" : "text-muted hover:bg-surface-2 hover:text-ink-2",
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>

      <details className="max-w-[660px]">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-[12.5px] text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
          <CircleHelp size={13} aria-hidden="true" /> Learn about this page
        </summary>
        <div className="mt-2 space-y-1.5 rounded-[var(--radius)] border border-border bg-surface p-3.5 text-[12.5px] leading-relaxed text-ink-2">
          <p className="m-0">
            Kira is built for more than one pair of hands. Invite your accountant, a bookkeeper, or a colleague from
            Settings, Members, and give each person the smallest role that does the job.
          </p>
          <p className="m-0">
            Only owners and admins can invite, change roles, or remove members. The owner role cannot be handed over
            from this page.
          </p>
        </div>
      </details>

      {canManage ? (
        <InviteMemberForm orgSlug={ctx.org.slug} />
      ) : (
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-3 text-[12.5px] text-muted">
          Only owners and admins can invite members, change roles, or remove people from {ctx.org.legal_name}.
        </div>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="m-0 text-[14px] font-semibold text-ink">
            Members ({data.members.length})
          </h2>
          <span className="text-[12px] text-muted">The owner role cannot be handed over from this page.</span>
        </div>
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
          <table className="w-full border-collapse text-[13px]" data-testid="members-table">
            <thead className="bg-surface">
              <tr>
                <th className={cn(TH, "text-left")}>Member</th>
                <th className={cn(TH, "text-left")}>Role</th>
                <th className={cn(TH, "text-left")}>Joined</th>
                <th className={cn(TH, "text-right")}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.members.map((m) => {
                const meta = ROLE_META[m.role];
                const editable = canManage && m.role !== "owner" && !m.isSelf;
                return (
                  <tr key={m.userId} className="border-t border-border transition-colors hover:bg-surface-2">
                    <td className={cn(TD, "py-2")}>
                      <div className="flex items-center gap-2 font-medium text-ink">
                        <span>{m.fullName || m.email}</span>
                        {m.isSelf && <span className="chip">You</span>}
                      </div>
                      <div className="text-[12px] text-muted">{m.email}</div>
                    </td>
                    <td className={TD}>
                      {editable ? (
                        <MemberRoleSelect
                          orgSlug={ctx.org.slug}
                          userId={m.userId}
                          email={m.email}
                          initialRole={m.role as AssignableRole}
                        />
                      ) : (
                        <span className={meta.chip}>{ms ? meta.labelMs : meta.label}</span>
                      )}
                    </td>
                    <td className={cn(TD, "num whitespace-nowrap text-ink-2")}>{shortDate(m.joinedAt)}</td>
                    <td className={cn(TD, "whitespace-nowrap text-right")}>
                      {editable ? (
                        <RemoveMemberButton orgSlug={ctx.org.slug} userId={m.userId} email={m.email} />
                      ) : (
                        <span className="text-muted">–</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-[14px] font-semibold text-ink">
          Pending invitations ({data.pendingInvites.length})
        </h2>
        {data.pendingInvites.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-border px-4 py-6 text-center text-[12.5px] text-muted">
            No pending invitations.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
            <table className="w-full border-collapse text-[13px]" data-testid="invites-table">
              <thead className="bg-surface">
                <tr>
                  <th className={cn(TH, "text-left")}>Email</th>
                  <th className={cn(TH, "text-left")}>Role</th>
                  <th className={cn(TH, "text-left")}>Expires</th>
                  <th className={cn(TH, "text-right")}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.pendingInvites.map((inv) => {
                  const meta = ROLE_META[inv.role];
                  return (
                    <tr key={inv.id} className="border-t border-border transition-colors hover:bg-surface-2">
                      <td className={cn(TD, "py-2")}>
                        <div className="font-medium text-ink">{inv.email}</div>
                        <div className="num text-[11.5px] text-muted">
                          <Link href={`/invite/${inv.token}`} className="text-brand hover:underline">
                            /invite/{inv.token.slice(0, 12)}…
                          </Link>
                        </div>
                      </td>
                      <td className={TD}>
                        <span className={meta.chip}>{ms ? meta.labelMs : meta.label}</span>
                      </td>
                      <td className={cn(TD, "num whitespace-nowrap text-ink-2")}>{shortDate(inv.expiresAt)}</td>
                      <td className={cn(TD, "whitespace-nowrap text-right")}>
                        {canManage ? (
                          <InviteRowActions
                            orgSlug={ctx.org.slug}
                            inviteId={inv.id}
                            token={inv.token}
                            email={inv.email}
                          />
                        ) : (
                          <span className="text-muted">–</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-5">
        <h2 className="m-0 text-[14px] font-semibold text-ink">What each role can do</h2>
        <dl className="m-0 mt-3 grid grid-cols-1 gap-3 text-[12.5px] sm:grid-cols-2">
          {(["viewer", "member", "admin", "owner"] as TeamRole[]).map((r) => (
            <div key={r} className="rounded-[var(--radius)] border border-border bg-surface-2/50 p-3">
              <dt className="flex items-center gap-2 font-semibold text-ink">
                <span className={ROLE_META[r].chip}>{ms ? ROLE_META[r].labelMs : ROLE_META[r].label}</span>
              </dt>
              <dd className="m-0 mt-1.5 leading-relaxed text-ink-2">{ROLE_META[r].summary}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

/** /{slug}/settings/activity: Team & ledger activity audit log. */
export async function ActivitySettingsPage({ ctx }: { ctx: OrgContext }) {
  const supabase = await createSupabaseServerClient();
  const rows = await loadActivityData(supabase, ctx.org.id, ctx.org.slug);
  const base = `/${ctx.org.slug}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col">
        <SettingsHeader base={base} legalName={ctx.org.legal_name} sub="Activity" active="team" />
        <div className="flex gap-1 overflow-x-auto pt-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SUB_TABS.map((t) => (
            <Link
              key={t.key}
              aria-current={t.key === "activity" ? "page" : undefined}
              href={`${base}/${t.href}`}
              className={cn(
                SUB,
                t.key === "activity" ? "bg-surface-2 text-ink" : "text-muted hover:bg-surface-2 hover:text-ink-2",
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="m-0 text-[14px] font-semibold text-ink">Recent activity</h2>
          <p className="m-0 mt-1 text-[12.5px] text-muted">
            Team membership changes and recent ledger postings for {ctx.org.legal_name}.
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted">
            No activity recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
            <table className="w-full border-collapse text-[13px]" data-testid="activity-table">
              <thead className="bg-surface">
                <tr>
                  <th className={cn(TH, "text-left")}>When (UTC)</th>
                  <th className={cn(TH, "text-left")}>Area</th>
                  <th className={cn(TH, "text-left")}>Actor</th>
                  <th className={cn(TH, "text-left")}>Event</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border transition-colors hover:bg-surface-2">
                    <td className={cn(TD, "num whitespace-nowrap text-ink-2")}>{shortDateTime(r.at)}</td>
                    <td className={cn(TD, "whitespace-nowrap")}>
                      <span className={r.kind === "team" ? "chip brand" : "chip"}>
                        {r.kind === "team" ? "Team" : "Ledger"}
                      </span>
                    </td>
                    <td className={cn(TD, "whitespace-nowrap text-ink-2")}>{r.actor ?? "System"}</td>
                    <td className={cn(TD, "text-ink")}>
                      {r.href ? (
                        <Link href={r.href} className="hover:text-brand hover:underline">
                          {r.summary}
                        </Link>
                      ) : (
                        r.summary
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/** /invite/[token]: Invitation preview & acceptance page. */
export async function InviteAcceptPage({ token }: { token: string }) {
  const supabase = await createSupabaseServerClient();
  const [preview, { data: claimsData }] = await Promise.all([
    loadInvitePreview(supabase, token),
    supabase.auth.getClaims(),
  ]);
  const signedInEmail = typeof claimsData?.claims?.email === "string" ? claimsData.claims.email : null;
  const nextPath = `/invite/${encodeURIComponent(token)}`;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-[440px]">
        <div className="mb-6 flex justify-center">
          <KiraLogo lang="en" />
        </div>
        <AuthCard>
          {!preview ? (
            <div className="flex flex-col gap-3 text-center">
              <h1 className="m-0 text-[18px] font-semibold text-ink">Invitation not found</h1>
              <p className="m-0 text-[13px] text-muted">
                This invitation link is invalid or has already been removed.
              </p>
              <div className="pt-2">
                <Link href="/login" className={buttonClass("secondary", "sm")}>
                  Go to sign in
                </Link>
              </div>
            </div>
          ) : preview.status !== "pending" || preview.expired ? (
            <div className="flex flex-col gap-3 text-center">
              <h1 className="m-0 text-[18px] font-semibold text-ink">
                {preview.status === "accepted"
                  ? "Invitation already accepted"
                  : preview.status === "revoked"
                    ? "Invitation revoked"
                    : "Invitation expired"}
              </h1>
              <p className="m-0 text-[13px] text-muted">
                {preview.status === "accepted"
                  ? `This invitation to ${preview.orgName} has already been used.`
                  : `Ask an owner or admin of ${preview.orgName} to send a fresh invite.`}
              </p>
              <div className="pt-2">
                <Link
                  href={preview.status === "accepted" ? `/${preview.orgSlug}` : "/login"}
                  className={buttonClass("primary", "sm")}
                >
                  {preview.status === "accepted" ? `Open ${preview.orgName}` : "Go to sign in"}
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <span className={ROLE_META[preview.role].chip}>{ROLE_META[preview.role].label}</span>
                <h1 className="m-0 mt-2 text-[20px] font-semibold leading-tight text-ink">
                  Join {preview.orgName}
                </h1>
                <p className="m-0 mt-1.5 text-[13px] leading-relaxed text-muted">
                  {preview.invitedByEmail ? `${preview.invitedByEmail} invited ` : "Invited "}
                  <strong className="text-ink">{preview.email}</strong> as{" "}
                  <strong className="text-ink">{ROLE_META[preview.role].label}</strong>.
                </p>
              </div>

              <p className="m-0 rounded-[var(--radius)] border border-border bg-surface-2/60 p-3 text-[12.5px] leading-relaxed text-ink-2">
                {ROLE_META[preview.role].summary}
              </p>

              {!signedInEmail ? (
                <div className="flex flex-col gap-2 pt-1">
                  <Link href={`/login?next=${encodeURIComponent(nextPath)}`} className={cn(buttonClass("primary"), "w-full")}>
                    Sign in to accept
                  </Link>
                  <Link href={`/signup?next=${encodeURIComponent(nextPath)}`} className={cn(buttonClass("secondary"), "w-full")}>
                    Create a Kira account
                  </Link>
                </div>
              ) : signedInEmail.toLowerCase() === preview.email.toLowerCase() ? (
                <AcceptInviteControl token={token} />
              ) : (
                <div className="flex flex-col gap-2 rounded-[var(--radius)] border border-border bg-surface-2 p-3 text-[12.5px] text-ink-2">
                  <p className="m-0">
                    You are signed in as <strong className="text-ink">{signedInEmail}</strong>, but this invitation was
                    sent to <strong className="text-ink">{preview.email}</strong>.
                  </p>
                  <p className="m-0 text-muted">Sign out and sign in with {preview.email} to accept.</p>
                </div>
              )}
            </div>
          )}
        </AuthCard>
      </div>
    </div>
  );
}
