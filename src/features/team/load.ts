import "server-only";
import type { createSupabaseServerClient } from "@/shared/supabase/server";
import type { ActivityRow, AssignableRole, InvitePreview, InviteRow, InviteStatus, MemberRow, TeamRole } from "./types";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export async function loadTeamData(supabase: Supabase, orgId: string, orgSlug: string) {
  const [{ data: memRows }, { data: invRows }] = await Promise.all([
    supabase.rpc("list_org_members", { p_slug: orgSlug }),
    supabase
      .from("organization_invitations")
      .select("id, email, role, token, status, invited_by_email, created_at, expires_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const now = Date.now();
  const members: MemberRow[] = ((memRows ?? []) as Record<string, unknown>[]).map((r) => ({
    userId: String(r.user_id),
    email: String(r.email ?? ""),
    fullName: String(r.full_name ?? ""),
    role: r.role as TeamRole,
    joinedAt: String(r.joined_at ?? ""),
    isSelf: Boolean(r.is_self),
  }));

  const invitations: InviteRow[] = (invRows ?? []).map((i) => ({
    id: i.id,
    email: i.email,
    role: i.role as AssignableRole,
    token: i.token,
    status: i.status as InviteStatus,
    invitedByEmail: i.invited_by_email ?? null,
    createdAt: i.created_at,
    expiresAt: i.expires_at,
    expired: new Date(i.expires_at).getTime() <= now,
  }));

  return {
    members,
    pendingInvites: invitations.filter((i) => i.status === "pending" && !i.expired),
    pastInvites: invitations.filter((i) => i.status !== "pending" || i.expired),
  };
}

export async function loadActivityData(supabase: Supabase, orgId: string, orgSlug: string): Promise<ActivityRow[]> {
  const [{ data: teamLogs }, { data: entries }] = await Promise.all([
    supabase
      .from("org_activity_log")
      .select("id, actor_email, action, summary, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(80),
    supabase
      .from("journal_entries")
      .select("id, entry_number, occurred_on, memo, source, created_at, voided_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  const rows: ActivityRow[] = [];
  for (const l of teamLogs ?? []) {
    rows.push({
      id: `team-${l.id}`,
      at: l.created_at,
      kind: "team",
      actor: l.actor_email ?? null,
      action: l.action,
      summary: l.summary,
      href: null,
    });
  }
  for (const e of entries ?? []) {
    const label = e.entry_number ?? e.source;
    rows.push({
      id: `je-${e.id}`,
      at: e.created_at,
      kind: "ledger",
      actor: null,
      action: e.voided_at ? "ledger.voided" : `ledger.${e.source}`,
      summary: `${label}${e.memo ? ` · ${e.memo}` : ""} (${e.occurred_on})${e.voided_at ? " [Void]" : ""}`,
      href: `/${orgSlug}/ledger/entries/${e.id}`,
    });
  }

  rows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return rows.slice(0, 100);
}

export async function loadInvitePreview(supabase: Supabase, token: string): Promise<InvitePreview | null> {
  const { data } = await supabase.rpc("preview_org_invitation", { p_token: token });
  if (!data || typeof data !== "object") return null;
  const r = data as Record<string, unknown>;
  return {
    orgName: String(r.orgName ?? ""),
    orgSlug: String(r.orgSlug ?? ""),
    email: String(r.email ?? ""),
    role: r.role as AssignableRole,
    status: r.status as InviteStatus,
    expiresAt: String(r.expiresAt ?? ""),
    expired: Boolean(r.expired),
    invitedByEmail: r.invitedByEmail ? String(r.invitedByEmail) : null,
  };
}
