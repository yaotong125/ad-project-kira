export type TeamRole = "owner" | "admin" | "member" | "viewer";
export type AssignableRole = "admin" | "member" | "viewer";
export type InviteStatus = "pending" | "accepted" | "revoked";

export const ROLE_META: Record<
  TeamRole,
  { label: string; labelMs: string; chip: string; summary: string }
> = {
  owner: {
    label: "Owner",
    labelMs: "Pemilik",
    chip: "chip brand",
    summary: "Everything, including business settings, financial year, billing, and deleting the organisation.",
  },
  admin: {
    label: "Admin",
    labelMs: "Admin",
    chip: "chip pos",
    summary: "Everything a bookkeeper can, plus inviting, changing roles, and removing members.",
  },
  member: {
    label: "Bookkeeper",
    labelMs: "Pembuku",
    chip: "chip",
    summary: "Records invoices, bills, payments, and journals, but cannot manage members.",
  },
  viewer: {
    label: "Viewer",
    labelMs: "Pemerhati",
    chip: "chip",
    summary: "Reads everything, changes nothing. Good for a director, an investor, or an auditor.",
  },
};

export const ASSIGNABLE_ROLES: AssignableRole[] = ["member", "admin", "viewer"];

export type MemberRow = {
  userId: string;
  email: string;
  fullName: string;
  role: TeamRole;
  joinedAt: string;
  isSelf: boolean;
};

export type InviteRow = {
  id: string;
  email: string;
  role: AssignableRole;
  token: string;
  status: InviteStatus;
  invitedByEmail: string | null;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
};

export type ActivityRow = {
  id: string;
  at: string;
  kind: "team" | "ledger";
  actor: string | null;
  action: string;
  summary: string;
  href: string | null;
};

export type InvitePreview = {
  orgName: string;
  orgSlug: string;
  email: string;
  role: AssignableRole;
  status: InviteStatus;
  expiresAt: string;
  expired: boolean;
  invitedByEmail: string | null;
};
