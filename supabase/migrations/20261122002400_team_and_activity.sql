-- Kira slice 26: Team & roles (/{slug}/settings/team, /{slug}/settings/activity, /invite/[token]).
-- Reverse engineered from lejar.ai's "team-and-roles" help article & Settings -> Team & activity tab.
-- Roles in Kira: owner (Owner), admin (Admin), member (Bookkeeper), viewer (Viewer).

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'member', 'viewer')),
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  invited_by uuid references auth.users (id) on delete set null,
  invited_by_email text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null
);

create unique index organization_invitations_pending_unique
  on public.organization_invitations (org_id, lower(email))
  where status = 'pending';
create index organization_invitations_org_idx on public.organization_invitations (org_id, created_at desc);

create table public.org_activity_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  actor_email text,
  action text not null,
  summary text not null,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index org_activity_log_org_idx on public.org_activity_log (org_id, created_at desc);

alter table public.organization_invitations enable row level security;
alter table public.org_activity_log enable row level security;

create policy invitations_read on public.organization_invitations
  for select to authenticated using (public.is_org_member(org_id));

create policy activity_read on public.org_activity_log
  for select to authenticated using (public.is_org_member(org_id));

-- ---------------------------------------------------------------------------------------------
-- Helpers (reuses public.org_for_admin(text) from 20261122001200_ledger.sql).
create function public.role_display_name(p_role text) returns text
language sql immutable as $$
  select case p_role
    when 'owner' then 'Owner'
    when 'admin' then 'Admin'
    when 'member' then 'Bookkeeper'
    when 'viewer' then 'Viewer'
    else p_role
  end;
$$;

-- ---------------------------------------------------------------------------------------------
-- List members (joins auth.users inside security definer for any org member).
create function public.list_org_members(p_slug text)
returns table (
  user_id uuid,
  email text,
  full_name text,
  role text,
  joined_at timestamptz,
  is_self boolean
)
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select o.id into v_org
  from public.organizations o
  join public.organization_members m on m.org_id = o.id and m.user_id = auth.uid()
  where o.slug = p_slug;
  if v_org is null then raise exception 'not_found' using errcode = '42501'; end if;

  return query
  select
    m.user_id,
    coalesce(u.email, '')::text as email,
    coalesce(
      nullif(btrim(u.raw_user_meta_data->>'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data->>'name'), ''),
      nullif(btrim(u.raw_user_meta_data->>'display_name'), ''),
      split_part(coalesce(u.email, ''), '@', 1)
    )::text as full_name,
    m.role,
    m.created_at as joined_at,
    (m.user_id = auth.uid()) as is_self
  from public.organization_members m
  left join auth.users u on u.id = m.user_id
  where m.org_id = v_org
  order by
    case m.role when 'owner' then 0 when 'admin' then 1 when 'member' then 2 else 3 end,
    m.created_at asc;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Invite a member.
create function public.invite_org_member(p_slug text, p_email text, p_role text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.org_for_admin(p_slug);
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_actor_email text;
  v_inv public.organization_invitations;
begin
  if v_email = '' or char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  if p_role not in ('admin', 'member', 'viewer') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  -- Refuse if already a member of this entity.
  if exists (
    select 1
    from public.organization_members m
    join auth.users u on u.id = m.user_id
    where m.org_id = v_org and lower(u.email) = v_email
  ) then
    raise exception 'already_member' using errcode = '22023';
  end if;

  -- Expire any stale pending invite for this email so re-inviting works cleanly.
  update public.organization_invitations
  set status = 'revoked'
  where org_id = v_org and lower(email) = v_email and status = 'pending' and expires_at <= now();

  if exists (
    select 1 from public.organization_invitations
    where org_id = v_org and lower(email) = v_email and status = 'pending'
  ) then
    raise exception 'already_invited' using errcode = '22023';
  end if;

  select email into v_actor_email from auth.users where id = auth.uid();

  insert into public.organization_invitations (org_id, email, role, invited_by, invited_by_email)
  values (v_org, v_email, p_role, auth.uid(), v_actor_email)
  returning * into v_inv;

  insert into public.org_activity_log (org_id, actor_id, actor_email, action, summary, meta)
  values (
    v_org, auth.uid(), v_actor_email, 'member.invited',
    'Invited ' || v_email || ' as ' || public.role_display_name(p_role),
    jsonb_build_object('email', v_email, 'role', p_role, 'invitation_id', v_inv.id)
  );

  return jsonb_build_object(
    'id', v_inv.id,
    'token', v_inv.token,
    'email', v_inv.email,
    'role', v_inv.role,
    'expiresAt', v_inv.expires_at
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Revoke a pending invitation.
create function public.revoke_org_invitation(p_slug text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.org_for_admin(p_slug);
  v_inv public.organization_invitations;
  v_actor_email text;
begin
  select * into v_inv from public.organization_invitations
  where id = p_id and org_id = v_org for update;
  if not found then raise exception 'not_found' using errcode = '22023'; end if;
  if v_inv.status <> 'pending' then raise exception 'not_pending' using errcode = '22023'; end if;

  update public.organization_invitations set status = 'revoked' where id = v_inv.id;
  select email into v_actor_email from auth.users where id = auth.uid();

  insert into public.org_activity_log (org_id, actor_id, actor_email, action, summary, meta)
  values (
    v_org, auth.uid(), v_actor_email, 'invite.revoked',
    'Revoked invitation for ' || v_inv.email,
    jsonb_build_object('email', v_inv.email, 'invitation_id', v_inv.id)
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Change an existing member's role.
create function public.update_org_member_role(p_slug text, p_user_id uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.org_for_admin(p_slug);
  v_curr text;
  v_target_email text;
  v_actor_email text;
begin
  if p_role not in ('admin', 'member', 'viewer') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'cannot_change_self' using errcode = '22023';
  end if;

  select m.role, u.email into v_curr, v_target_email
  from public.organization_members m
  left join auth.users u on u.id = m.user_id
  where m.org_id = v_org and m.user_id = p_user_id
  for update of m;
  if not found then raise exception 'not_found' using errcode = '22023'; end if;
  if v_curr = 'owner' then raise exception 'cannot_change_owner' using errcode = '22023'; end if;
  if v_curr = p_role then return; end if;

  update public.organization_members set role = p_role where org_id = v_org and user_id = p_user_id;
  select email into v_actor_email from auth.users where id = auth.uid();

  insert into public.org_activity_log (org_id, actor_id, actor_email, action, summary, meta)
  values (
    v_org, auth.uid(), v_actor_email, 'member.role_changed',
    'Changed ' || coalesce(v_target_email, 'member') || ' from ' || public.role_display_name(v_curr) || ' to ' || public.role_display_name(p_role),
    jsonb_build_object('target_user_id', p_user_id, 'email', v_target_email, 'from', v_curr, 'to', p_role)
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Remove a member from the organisation.
create function public.remove_org_member(p_slug text, p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.org_for_admin(p_slug);
  v_curr text;
  v_target_email text;
  v_actor_email text;
begin
  if p_user_id = auth.uid() then
    raise exception 'cannot_remove_self' using errcode = '22023';
  end if;

  select m.role, u.email into v_curr, v_target_email
  from public.organization_members m
  left join auth.users u on u.id = m.user_id
  where m.org_id = v_org and m.user_id = p_user_id
  for update of m;
  if not found then raise exception 'not_found' using errcode = '22023'; end if;
  if v_curr = 'owner' then raise exception 'cannot_remove_owner' using errcode = '22023'; end if;

  delete from public.organization_members where org_id = v_org and user_id = p_user_id;
  select email into v_actor_email from auth.users where id = auth.uid();

  insert into public.org_activity_log (org_id, actor_id, actor_email, action, summary, meta)
  values (
    v_org, auth.uid(), v_actor_email, 'member.removed',
    'Removed ' || coalesce(v_target_email, 'member') || ' (' || public.role_display_name(v_curr) || ')',
    jsonb_build_object('target_user_id', p_user_id, 'email', v_target_email, 'role', v_curr)
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Invitation preview & acceptance (/invite/[token]).
create function public.preview_org_invitation(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_inv record;
begin
  if p_token is null or char_length(p_token) < 16 then return null; end if;
  select i.*, o.legal_name as org_name, o.slug as org_slug
  into v_inv
  from public.organization_invitations i
  join public.organizations o on o.id = i.org_id
  where i.token = p_token;
  if not found then return null; end if;

  return jsonb_build_object(
    'orgName', v_inv.org_name,
    'orgSlug', v_inv.org_slug,
    'email', v_inv.email,
    'role', v_inv.role,
    'status', v_inv.status,
    'expiresAt', v_inv.expires_at,
    'expired', (v_inv.expires_at <= now()),
    'invitedByEmail', v_inv.invited_by_email
  );
end;
$$;

create function public.accept_org_invitation(p_token text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_inv public.organization_invitations;
  v_slug text;
  v_user_email text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into v_inv from public.organization_invitations where token = p_token for update;
  if not found then raise exception 'not_found' using errcode = '22023'; end if;
  if v_inv.status <> 'pending' then raise exception 'not_pending' using errcode = '22023'; end if;
  if v_inv.expires_at <= now() then raise exception 'expired' using errcode = '22023'; end if;

  select email into v_user_email from auth.users where id = auth.uid();
  if v_user_email is null or lower(v_user_email) <> lower(v_inv.email) then
    raise exception 'email_mismatch' using errcode = '22023';
  end if;

  select slug into v_slug from public.organizations where id = v_inv.org_id;

  insert into public.organization_members (org_id, user_id, role)
  values (v_inv.org_id, auth.uid(), v_inv.role)
  on conflict (org_id, user_id) do nothing;

  update public.organization_invitations
  set status = 'accepted', accepted_at = now(), accepted_by = auth.uid()
  where id = v_inv.id;

  insert into public.org_activity_log (org_id, actor_id, actor_email, action, summary, meta)
  values (
    v_inv.org_id, auth.uid(), lower(v_user_email), 'member.joined',
    lower(v_user_email) || ' joined as ' || public.role_display_name(v_inv.role),
    jsonb_build_object('email', lower(v_user_email), 'role', v_inv.role, 'invitation_id', v_inv.id)
  );

  return v_slug;
end;
$$;

revoke all on function public.list_org_members(text) from public, anon;
grant execute on function public.list_org_members(text) to authenticated;
revoke all on function public.invite_org_member(text, text, text) from public, anon;
grant execute on function public.invite_org_member(text, text, text) to authenticated;
revoke all on function public.revoke_org_invitation(text, uuid) from public, anon;
grant execute on function public.revoke_org_invitation(text, uuid) to authenticated;
revoke all on function public.update_org_member_role(text, uuid, text) from public, anon;
grant execute on function public.update_org_member_role(text, uuid, text) to authenticated;
revoke all on function public.remove_org_member(text, uuid) from public, anon;
grant execute on function public.remove_org_member(text, uuid) to authenticated;
revoke all on function public.preview_org_invitation(text) from public;
grant execute on function public.preview_org_invitation(text) to anon, authenticated;
revoke all on function public.accept_org_invitation(text) from public, anon;
grant execute on function public.accept_org_invitation(text) to authenticated;
