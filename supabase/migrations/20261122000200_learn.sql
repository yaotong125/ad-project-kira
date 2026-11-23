-- Kira slice 4: Learn Kira (lejar.ai's /{slug}/learn, the page /{slug}/getting-started redirects to).
-- See docs/re/04-learn.md. Progress per entity: a section is in progress, skipped or checked;
-- "Hide Learn Kira" is a flag on the entity. Writes go through the functions below, which check
-- the caller's role (lejar.ai: "An owner, admin or bookkeeper starts or skips a section").

alter table public.organizations add column learn_hidden boolean not null default false;

create table public.learn_progress (
  org_id uuid not null references public.organizations (id) on delete cascade,
  section text not null check (section in (
    'receipt-to-bill', 'add-contact', 'send-invoice', 'import-bank', 'match-bank', 'ask-lejar', 'read-pnl')),
  state text not null check (state in ('in_progress', 'skipped', 'checked')),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (org_id, section)
);

alter table public.learn_progress enable row level security;
create policy "members read learn progress" on public.learn_progress
  for select to authenticated using (public.is_org_member(org_id));

-- Section order (lejar.ai's Learn page, 2026-11-22).
create function public.learn_sections() returns text[]
language sql immutable as $$
  select array['receipt-to-bill', 'add-contact', 'send-invoice', 'import-bank', 'match-bank', 'ask-lejar', 'read-pnl'];
$$;

-- The org a member may change Learn progress for (owner, admin or member; viewers may not).
create function public.learn_org_for_editor(p_slug text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v_org uuid;
begin
  select o.id into v_org
  from public.organizations o
  join public.organization_members m on m.org_id = o.id and m.user_id = auth.uid()
  where o.slug = p_slug and m.role in ('owner', 'admin', 'member');
  if v_org is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return v_org;
end;
$$;

-- The section that is open now: the first one neither checked nor skipped (null when all are done).
create function public.learn_current_section(p_org uuid) returns text
language sql stable security definer set search_path = public as $$
  select s from unnest(public.learn_sections()) with ordinality as t(s, n)
  where not exists (
    select 1 from public.learn_progress p
    where p.org_id = p_org and p.section = t.s and p.state in ('checked', 'skipped'))
  order by n limit 1;
$$;

create function public.set_learn_hidden(p_slug text, p_hidden boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.organizations set learn_hidden = p_hidden where id = public.learn_org_for_editor(p_slug);
end;
$$;

-- "Skip for now": only the section that is open now can be skipped (lejar.ai: learn.error.notSkippable).
create function public.skip_learn_section(p_slug text, p_section text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
begin
  if p_section is distinct from public.learn_current_section(v_org) then
    raise exception 'not_skippable' using errcode = '22023';
  end if;
  insert into public.learn_progress (org_id, section, state, updated_by)
  values (v_org, p_section, 'skipped', auth.uid())
  on conflict (org_id, section) do update set state = 'skipped', updated_by = auth.uid(), updated_at = now();
end;
$$;

-- "Start": the open section, or one that was skipped, becomes "in progress". Never undoes "checked".
create function public.start_learn_section(p_slug text, p_section text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
begin
  if not (p_section = any (public.learn_sections())) then
    raise exception 'unknown_section' using errcode = '22023';
  end if;
  if p_section is distinct from public.learn_current_section(v_org)
     and not exists (select 1 from public.learn_progress
                     where org_id = v_org and section = p_section and state = 'skipped') then
    raise exception 'not_startable' using errcode = '22023';
  end if;
  insert into public.learn_progress (org_id, section, state, updated_by)
  values (v_org, p_section, 'in_progress', auth.uid())
  on conflict (org_id, section) do update
    set state = 'in_progress', updated_by = auth.uid(), updated_at = now()
    where public.learn_progress.state <> 'checked';
end;
$$;

-- Called by feature slices when the real job is done (bill recorded, contact saved, …).
create function public.check_learn_section(p_org uuid, p_section text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_org_member(p_org) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  insert into public.learn_progress (org_id, section, state, updated_by)
  values (p_org, p_section, 'checked', auth.uid())
  on conflict (org_id, section) do update set state = 'checked', updated_by = auth.uid(), updated_at = now();
end;
$$;

revoke all on function public.learn_org_for_editor(text) from public, anon;
revoke all on function public.learn_current_section(uuid) from public, anon;
revoke all on function public.set_learn_hidden(text, boolean) from public, anon;
revoke all on function public.skip_learn_section(text, text) from public, anon;
revoke all on function public.start_learn_section(text, text) from public, anon;
revoke all on function public.check_learn_section(uuid, text) from public, anon;
grant execute on function public.learn_current_section(uuid) to authenticated;
grant execute on function public.set_learn_hidden(text, boolean) to authenticated;
grant execute on function public.skip_learn_section(text, text) to authenticated;
grant execute on function public.start_learn_section(text, text) to authenticated;
grant execute on function public.check_learn_section(uuid, text) to authenticated;
