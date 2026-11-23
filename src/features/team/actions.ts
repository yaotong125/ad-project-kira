"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import type { AssignableRole } from "./types";

const MESSAGES: Record<string, string> = {
  unauthenticated: "Your session expired. Sign in again.",
  not_found: "Record not found.",
  admin_only: "Only owners and admins can manage members.",
  invalid_email: "Enter a valid email address.",
  invalid_role: "Choose Admin, Bookkeeper, or Viewer.",
  already_member: "That person is already a member of this entity.",
  already_invited: "There is already a pending invitation for that email.",
  not_pending: "This invitation is no longer pending.",
  cannot_change_self: "You cannot change your own role.",
  cannot_change_owner: "The owner role cannot be handed over from this page.",
  cannot_remove_self: "You cannot remove yourself from this page.",
  cannot_remove_owner: "The organisation owner cannot be removed.",
  expired: "This invitation has expired. Ask an owner or admin to send a new one.",
  email_mismatch: "This invitation was sent to a different email address.",
};

function mapErr(message: string | undefined): string {
  if (!message) return "Something went wrong. Please try again.";
  for (const [k, v] of Object.entries(MESSAGES)) {
    if (message.includes(k)) return v;
  }
  return message;
}

export async function inviteMemberAction(
  orgSlug: string,
  email: string,
  role: AssignableRole,
): Promise<{ ok: true; id: string; token: string; email: string; role: AssignableRole } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("invite_org_member", {
    p_slug: orgSlug,
    p_email: email,
    p_role: role,
  });
  if (error) return { ok: false, error: mapErr(error.message) };
  revalidatePath(`/${orgSlug}/settings/team`);
  revalidatePath(`/${orgSlug}/settings/activity`);
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    id: String(r.id ?? ""),
    token: String(r.token ?? ""),
    email: String(r.email ?? email),
    role: (r.role as AssignableRole) ?? role,
  };
}

export async function revokeInviteAction(
  orgSlug: string,
  inviteId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("revoke_org_invitation", {
    p_slug: orgSlug,
    p_id: inviteId,
  });
  if (error) return { ok: false, error: mapErr(error.message) };
  revalidatePath(`/${orgSlug}/settings/team`);
  revalidatePath(`/${orgSlug}/settings/activity`);
  return { ok: true };
}

export async function changeMemberRoleAction(
  orgSlug: string,
  userId: string,
  role: AssignableRole,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_org_member_role", {
    p_slug: orgSlug,
    p_user_id: userId,
    p_role: role,
  });
  if (error) return { ok: false, error: mapErr(error.message) };
  revalidatePath(`/${orgSlug}/settings/team`);
  revalidatePath(`/${orgSlug}/settings/activity`);
  return { ok: true };
}

export async function removeMemberAction(
  orgSlug: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("remove_org_member", {
    p_slug: orgSlug,
    p_user_id: userId,
  });
  if (error) return { ok: false, error: mapErr(error.message) };
  revalidatePath(`/${orgSlug}/settings/team`);
  revalidatePath(`/${orgSlug}/settings/activity`);
  return { ok: true };
}

export async function acceptInviteAction(
  token: string,
): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("accept_org_invitation", { p_token: token });
  if (error) return { ok: false, error: mapErr(error.message) };
  const slug = String(data ?? "");
  if (slug) {
    revalidatePath(`/${slug}/settings/team`);
    revalidatePath(`/${slug}/settings/activity`);
  }
  return { ok: true, slug };
}
