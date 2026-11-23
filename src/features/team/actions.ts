"use server";

import { revalidatePath } from "next/cache";
import { siteOrigin } from "@/shared/auth/origin";
import { sendEmail } from "@/shared/email/mailer";
import { teamInviteEmail } from "@/shared/email/templates";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { ROLE_META, type AssignableRole } from "./types";

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
): Promise<
  | {
      ok: true;
      id: string;
      token: string;
      email: string;
      role: AssignableRole;
      emailStatus: "sent" | "skipped" | "failed";
      emailMessage?: string;
    }
  | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("invite_org_member", {
    p_slug: orgSlug,
    p_email: email,
    p_role: role,
  });
  if (error) return { ok: false, error: mapErr(error.message) };

  const r = (data ?? {}) as Record<string, unknown>;
  const id = String(r.id ?? "");
  const token = String(r.token ?? "");
  const invitedEmail = String(r.email ?? email);
  const invitedRole = (r.role as AssignableRole) ?? role;

  let emailStatus: "sent" | "skipped" | "failed" = "skipped";
  let emailMessage: string | undefined;

  if (token) {
    const [{ data: org }, { data: authData }, origin] = await Promise.all([
      supabase.from("organizations").select("legal_name").eq("slug", orgSlug).maybeSingle(),
      supabase.auth.getUser(),
      siteOrigin(),
    ]);
    const inviteUrl = `${origin}/invite/${token}`;
    const tpl = teamInviteEmail({
      orgName: org?.legal_name ?? orgSlug,
      inviterEmail: authData.user?.email ?? "A team admin",
      roleLabel: ROLE_META[invitedRole]?.label ?? invitedRole,
      inviteUrl,
    });
    const sent = await sendEmail({
      to: invitedEmail,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      replyTo: authData.user?.email ?? undefined,
    });
    emailStatus = sent.status;
    emailMessage = sent.status === "failed" ? sent.error : sent.status === "skipped" ? sent.reason : undefined;

    await supabase
      .rpc("log_org_email", {
        p_slug: orgSlug,
        p_doc_type: "team_invite",
        p_doc_id: id,
        p_recipient_email: invitedEmail,
        p_subject: tpl.subject,
        p_provider: "resend",
        p_provider_message_id: sent.status === "sent" ? sent.messageId : null,
        p_status: sent.status,
        p_error_message: emailMessage ?? null,
      })
      .then(
        () => {},
        () => {},
      );
  }

  revalidatePath(`/${orgSlug}/settings/team`);
  revalidatePath(`/${orgSlug}/settings/activity`);
  revalidatePath(`/${orgSlug}/settings/data`);
  return {
    ok: true,
    id,
    token,
    email: invitedEmail,
    role: invitedRole,
    emailStatus,
    emailMessage,
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
