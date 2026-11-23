-- Slice 36: Live LHDN MyInvois OAuth 2.0 & REST API credentials + live response sync RPCs.

alter table public.organizations
  add column if not exists myinvois_client_id text,
  add column if not exists myinvois_client_secret_enc text,
  add column if not exists myinvois_client_secret_hint text,
  add column if not exists myinvois_on_behalf_of text;

create or replace function public.save_myinvois_credentials(
  p_slug text,
  p_client_id text,
  p_client_secret_enc text,
  p_client_secret_hint text,
  p_on_behalf_of text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.org_for_admin(p_slug);
  v_cid text := btrim(coalesce(p_client_id, ''));
  v_actor_email text;
begin
  if v_cid = '' then
    raise exception 'Client ID is required.';
  end if;

  update public.organizations
  set myinvois_client_id = v_cid,
      myinvois_client_secret_enc = case
        when nullif(btrim(coalesce(p_client_secret_enc, '')), '') is not null then p_client_secret_enc
        else myinvois_client_secret_enc
      end,
      myinvois_client_secret_hint = case
        when nullif(btrim(coalesce(p_client_secret_hint, '')), '') is not null then left(p_client_secret_hint, 16)
        else myinvois_client_secret_hint
      end,
      myinvois_on_behalf_of = nullif(btrim(coalesce(p_on_behalf_of, '')), '')
  where id = v_org;

  select email into v_actor_email from auth.users where id = auth.uid();
  insert into public.org_activity_log (org_id, actor_id, actor_email, action, summary, meta)
  values (v_org, auth.uid(), v_actor_email, 'myinvois.credentials_saved', 'Updated LHDN MyInvois API credentials', jsonb_build_object('client_id_prefix', left(v_cid, 8)));
end;
$$;

create or replace function public.clear_myinvois_credentials(p_slug text) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.org_for_admin(p_slug);
  v_actor_email text;
begin
  update public.organizations
  set myinvois_client_id = null,
      myinvois_client_secret_enc = null,
      myinvois_client_secret_hint = null,
      myinvois_on_behalf_of = null
  where id = v_org;

  select email into v_actor_email from auth.users where id = auth.uid();
  insert into public.org_activity_log (org_id, actor_id, actor_email, action, summary, meta)
  values (v_org, auth.uid(), v_actor_email, 'myinvois.credentials_cleared', 'Cleared LHDN MyInvois API credentials (reverted to sandbox simulation)', '{}'::jsonb);
end;
$$;

-- Persists live LHDN API responses onto an existing myinvois_submissions record.
create or replace function public.record_myinvois_api_result(
  p_slug text,
  p_submission_id uuid,
  p_status text,
  p_lhdn_uuid text,
  p_long_id text,
  p_submission_uid text,
  p_rejection_reason text,
  p_validated_at timestamptz default null,
  p_cancelled_at timestamptz default null,
  p_cancel_reason text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
begin
  if p_status not in ('pending', 'valid', 'rejected', 'cancelled') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  update public.myinvois_submissions
  set status = p_status,
      lhdn_uuid = coalesce(nullif(btrim(coalesce(p_lhdn_uuid, '')), ''), lhdn_uuid),
      long_id = coalesce(nullif(btrim(coalesce(p_long_id, '')), ''), long_id),
      submission_uid = coalesce(nullif(btrim(coalesce(p_submission_uid, '')), ''), submission_uid),
      rejection_reason = case when p_status = 'rejected' then nullif(btrim(coalesce(p_rejection_reason, '')), '') else null end,
      validated_at = coalesce(p_validated_at, case when p_status = 'valid' then coalesce(validated_at, now()) else validated_at end),
      cancelled_at = coalesce(p_cancelled_at, case when p_status = 'cancelled' then coalesce(cancelled_at, now()) else cancelled_at end),
      cancel_reason = coalesce(nullif(btrim(coalesce(p_cancel_reason, '')), ''), cancel_reason)
  where id = p_submission_id and org_id = v_org;

  if not found then
    raise exception 'not_found' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.save_myinvois_credentials(text, text, text, text, text) from public, anon;
grant execute on function public.save_myinvois_credentials(text, text, text, text, text) to authenticated;

revoke all on function public.clear_myinvois_credentials(text) from public, anon;
grant execute on function public.clear_myinvois_credentials(text) to authenticated;

revoke all on function public.record_myinvois_api_result(text, uuid, text, text, text, text, text, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.record_myinvois_api_result(text, uuid, text, text, text, text, text, timestamptz, timestamptz, text) to authenticated;
