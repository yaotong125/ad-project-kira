-- Kira slice 31: Remaining Settings tabs (API & webhooks, Data & AI, Account & security).
-- Reverse engineered from lejar.ai's security, data-and-privacy, settings.language.* & settings.aiMemory.* specs.

alter table public.organizations
  add column if not exists ai_memory_enabled boolean not null default true,
  add column if not exists require_mfa_for_admins boolean not null default false;

create table public.org_api_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  key_prefix text not null check (char_length(key_prefix) between 6 and 24),
  key_hash text not null unique,
  scope text not null default 'read' check (scope in ('read', 'write')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index org_api_keys_org_idx on public.org_api_keys (org_id, created_at desc);

create table public.org_webhooks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  url text not null check (url ~ '^https?://'),
  events text[] not null default array['invoice.recorded']::text[],
  signing_secret_prefix text not null,
  signing_secret_hash text not null,
  enabled boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index org_webhooks_org_idx on public.org_webhooks (org_id, created_at desc);

alter table public.org_api_keys enable row level security;
alter table public.org_webhooks enable row level security;

create policy org_api_keys_read on public.org_api_keys
  for select to authenticated using (public.is_org_member(org_id));
create policy org_webhooks_read on public.org_webhooks
  for select to authenticated using (public.is_org_member(org_id));

-- ---------------------------------------------------------------------------------------------
-- API keys RPCs (Owner / Admin only).
create function public.create_org_api_key(
  p_slug text, p_name text, p_scope text, p_key_prefix text, p_key_hash text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.org_for_admin(p_slug);
  v_name text := btrim(coalesce(p_name, ''));
  v_scope text := case when p_scope = 'write' then 'write' else 'read' end;
  v_id uuid;
  v_actor_email text;
begin
  if char_length(v_name) < 1 or char_length(v_name) > 100 then raise exception 'invalid_name' using errcode = '22023'; end if;
  if char_length(coalesce(p_key_hash, '')) < 32 then raise exception 'invalid_key' using errcode = '22023'; end if;

  insert into public.org_api_keys (org_id, name, key_prefix, key_hash, scope, created_by)
  values (v_org, v_name, left(p_key_prefix, 24), p_key_hash, v_scope, auth.uid())
  returning id into v_id;

  select email into v_actor_email from auth.users where id = auth.uid();
  insert into public.org_activity_log (org_id, actor_id, actor_email, action, summary, meta)
  values (v_org, auth.uid(), v_actor_email, 'api_key.created', 'Created API key "' || v_name || '" (' || v_scope || ')', jsonb_build_object('key_id', v_id));

  return v_id;
end;
$$;

create function public.revoke_org_api_key(p_slug text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.org_for_admin(p_slug);
  v_name text;
  v_actor_email text;
begin
  select name into v_name from public.org_api_keys where id = p_id and org_id = v_org and revoked_at is null for update;
  if not found then raise exception 'not_found' using errcode = '22023'; end if;
  update public.org_api_keys set revoked_at = now() where id = p_id;

  select email into v_actor_email from auth.users where id = auth.uid();
  insert into public.org_activity_log (org_id, actor_id, actor_email, action, summary, meta)
  values (v_org, auth.uid(), v_actor_email, 'api_key.revoked', 'Revoked API key "' || v_name || '"', jsonb_build_object('key_id', p_id));
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Webhooks RPCs (Owner / Admin only).
create function public.create_org_webhook(
  p_slug text, p_url text, p_events text[], p_secret_prefix text, p_secret_hash text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.org_for_admin(p_slug);
  v_url text := btrim(coalesce(p_url, ''));
  v_id uuid;
begin
  if v_url !~ '^https?://[^/\s]+' then raise exception 'invalid_url' using errcode = '22023'; end if;
  if coalesce(array_length(p_events, 1), 0) = 0 then raise exception 'events_required' using errcode = '22023'; end if;

  insert into public.org_webhooks (org_id, url, events, signing_secret_prefix, signing_secret_hash, created_by)
  values (v_org, left(v_url, 500), p_events, left(p_secret_prefix, 24), p_secret_hash, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create function public.toggle_org_webhook(p_slug text, p_id uuid, p_enabled boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.org_for_admin(p_slug);
begin
  update public.org_webhooks set enabled = coalesce(p_enabled, false) where id = p_id and org_id = v_org;
  if not found then raise exception 'not_found' using errcode = '22023'; end if;
end;
$$;

create function public.delete_org_webhook(p_slug text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.org_for_admin(p_slug);
begin
  delete from public.org_webhooks where id = p_id and org_id = v_org;
  if not found then raise exception 'not_found' using errcode = '22023'; end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Data & AI + Security toggles.
create function public.set_ai_memory_enabled(p_slug text, p_enabled boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.org_for_admin(p_slug);
begin
  update public.organizations set ai_memory_enabled = coalesce(p_enabled, true) where id = v_org;
end;
$$;

create function public.clear_org_ai_memory(p_slug text) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.org_for_admin(p_slug);
  v_deleted integer := 0;
begin
  delete from public.chat_conversations where org_id = v_org;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

create function public.set_require_mfa_for_admins(p_slug text, p_required boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.org_for_owner(p_slug);
begin
  update public.organizations set require_mfa_for_admins = coalesce(p_required, false) where id = v_org;
end;
$$;

create function public.delete_organization(p_slug text, p_confirm_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.org_for_owner(p_slug);
  v_legal text;
begin
  select legal_name into v_legal from public.organizations where id = v_org for update;
  if btrim(coalesce(p_confirm_name, '')) <> v_legal then
    raise exception 'name_mismatch' using errcode = '22023';
  end if;
  delete from public.organizations where id = v_org;
end;
$$;

revoke all on function public.create_org_api_key(text, text, text, text, text) from public, anon;
grant execute on function public.create_org_api_key(text, text, text, text, text) to authenticated;
revoke all on function public.revoke_org_api_key(text, uuid) from public, anon;
grant execute on function public.revoke_org_api_key(text, uuid) to authenticated;
revoke all on function public.create_org_webhook(text, text, text[], text, text) from public, anon;
grant execute on function public.create_org_webhook(text, text, text[], text, text) to authenticated;
revoke all on function public.toggle_org_webhook(text, uuid, boolean) from public, anon;
grant execute on function public.toggle_org_webhook(text, uuid, boolean) to authenticated;
revoke all on function public.delete_org_webhook(text, uuid) from public, anon;
grant execute on function public.delete_org_webhook(text, uuid) to authenticated;
revoke all on function public.set_ai_memory_enabled(text, boolean) from public, anon;
grant execute on function public.set_ai_memory_enabled(text, boolean) to authenticated;
revoke all on function public.clear_org_ai_memory(text) from public, anon;
grant execute on function public.clear_org_ai_memory(text) to authenticated;
revoke all on function public.set_require_mfa_for_admins(text, boolean) from public, anon;
grant execute on function public.set_require_mfa_for_admins(text, boolean) to authenticated;
revoke all on function public.delete_organization(text, text) from public, anon;
grant execute on function public.delete_organization(text, text) to authenticated;
