-- Slice 35: Outbound email delivery log (Resend) for Team invites, Invoices, Quick invoices, and Quotes.

create table if not exists public.org_email_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  doc_type text not null check (doc_type in ('team_invite', 'invoice', 'quick_invoice', 'quote')),
  doc_id text,
  recipient_email text not null,
  subject text not null,
  provider text not null default 'resend',
  provider_message_id text,
  status text not null check (status in ('sent', 'skipped', 'failed')),
  error_message text,
  sent_by uuid references auth.users(id) on delete set null,
  sent_at timestamptz not null default now()
);

create index if not exists idx_org_email_logs_org on public.org_email_logs (org_id, sent_at desc);

alter table public.org_email_logs enable row level security;

drop policy if exists "org_email_logs_select_member" on public.org_email_logs;
create policy "org_email_logs_select_member" on public.org_email_logs
  for select to authenticated using (public.is_org_member(org_id));

create or replace function public.log_org_email(
  p_slug text,
  p_doc_type text,
  p_doc_id text,
  p_recipient_email text,
  p_subject text,
  p_provider text,
  p_provider_message_id text,
  p_status text,
  p_error_message text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  v_id uuid;
  v_actor_email text;
begin
  if p_doc_type not in ('team_invite', 'invoice', 'quick_invoice', 'quote') then
    raise exception 'invalid_doc_type' using errcode = '22023';
  end if;
  if p_status not in ('sent', 'skipped', 'failed') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  insert into public.org_email_logs (
    org_id, doc_type, doc_id, recipient_email, subject,
    provider, provider_message_id, status, error_message, sent_by
  ) values (
    v_org, p_doc_type, nullif(btrim(coalesce(p_doc_id, '')), ''), btrim(p_recipient_email),
    left(btrim(p_subject), 300), coalesce(nullif(btrim(p_provider), ''), 'resend'),
    nullif(btrim(coalesce(p_provider_message_id, '')), ''), p_status,
    nullif(btrim(coalesce(p_error_message, '')), ''), auth.uid()
  )
  returning id into v_id;

  if p_status = 'sent' then
    select email into v_actor_email from auth.users where id = auth.uid();
    insert into public.org_activity_log (org_id, actor_id, actor_email, action, summary, meta)
    values (
      v_org,
      auth.uid(),
      v_actor_email,
      'email.sent',
      'Emailed ' || replace(p_doc_type, '_', ' ') || ' to ' || btrim(p_recipient_email),
      jsonb_build_object('log_id', v_id, 'doc_type', p_doc_type, 'doc_id', p_doc_id, 'message_id', p_provider_message_id)
    );
  end if;

  return v_id;
end;
$$;

revoke all on function public.log_org_email(text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.log_org_email(text, text, text, text, text, text, text, text, text) to authenticated;
