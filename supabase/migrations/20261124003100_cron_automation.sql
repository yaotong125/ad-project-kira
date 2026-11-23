-- Slice 34: Scheduled automation cron engine (recurring invoices/bills, depreciation, prepaids).

alter table public.organizations
  add column if not exists auto_run_enabled boolean not null default true;

create table if not exists public.org_automation_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  trigger_source text not null check (trigger_source in ('cron', 'manual')),
  as_of_date date not null,
  invoices_generated integer not null default 0,
  bills_generated integer not null default 0,
  depreciation_posted integer not null default 0,
  prepaids_posted integer not null default 0,
  status text not null default 'ok' check (status in ('ok', 'partial', 'failed')),
  details jsonb not null default '{}'::jsonb,
  error_message text,
  ran_by uuid references auth.users(id) on delete set null,
  ran_at timestamptz not null default now()
);

create index if not exists idx_org_automation_runs_org on public.org_automation_runs (org_id, ran_at desc);

alter table public.org_automation_runs enable row level security;

drop policy if exists "org_automation_runs_select_member" on public.org_automation_runs;
create policy "org_automation_runs_select_member" on public.org_automation_runs
  for select to authenticated using (public.is_org_member(org_id));

-- Toggle daily unattended automation per organisation (Owner / Admin).
create or replace function public.set_auto_run_enabled(p_slug text, p_enabled boolean) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.org_for_admin(p_slug);
  v_actor_email text;
begin
  update public.organizations set auto_run_enabled = coalesce(p_enabled, true) where id = v_org;
  select email into v_actor_email from auth.users where id = auth.uid();
  insert into public.org_activity_log (org_id, actor_id, actor_email, action, summary, meta)
  values (
    v_org,
    auth.uid(),
    v_actor_email,
    'automation.toggled',
    case when coalesce(p_enabled, true) then 'Enabled daily scheduled automations' else 'Paused daily scheduled automations' end,
    jsonb_build_object('auto_run_enabled', coalesce(p_enabled, true))
  );
end;
$$;

-- Internal runner for a single org (assumes caller has established org auth context).
create or replace function public.run_org_automations_internal(
  p_org_id uuid,
  p_slug text,
  p_as_of date,
  p_trigger text,
  p_actor uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_as_of date := coalesce(p_as_of, (now() at time zone 'Asia/Kuala_Lumpur')::date);
  v_inv jsonb := '{}'::jsonb;
  v_bill jsonb := '{}'::jsonb;
  v_dep jsonb := '{}'::jsonb;
  v_prep jsonb := '{}'::jsonb;
  v_errors text[] := array[]::text[];
  v_inv_count int := 0;
  v_bill_count int := 0;
  v_dep_count int := 0;
  v_prep_count int := 0;
  v_status text := 'ok';
  v_err_msg text := null;
  v_run_id uuid;
  v_actor_email text;
begin
  begin
    v_inv := public.generate_due_recurring(p_slug, 'invoice', v_as_of);
    v_inv_count := coalesce((v_inv->>'generated')::int, 0);
  exception when others then
    v_errors := array_append(v_errors, 'recurring_invoices: ' || sqlerrm);
    v_inv := jsonb_build_object('error', sqlerrm);
  end;

  begin
    v_bill := public.generate_due_recurring(p_slug, 'bill', v_as_of);
    v_bill_count := coalesce((v_bill->>'generated')::int, 0);
  exception when others then
    v_errors := array_append(v_errors, 'recurring_bills: ' || sqlerrm);
    v_bill := jsonb_build_object('error', sqlerrm);
  end;

  begin
    v_dep := public.run_depreciation(p_slug, v_as_of);
    v_dep_count := coalesce((v_dep->>'posted')::int, 0);
  exception when others then
    v_errors := array_append(v_errors, 'depreciation: ' || sqlerrm);
    v_dep := jsonb_build_object('error', sqlerrm);
  end;

  begin
    v_prep := public.post_due_prepaids(p_slug, v_as_of);
    v_prep_count := coalesce((v_prep->>'posted')::int, 0);
  exception when others then
    v_errors := array_append(v_errors, 'prepaids: ' || sqlerrm);
    v_prep := jsonb_build_object('error', sqlerrm);
  end;

  if coalesce(array_length(v_errors, 1), 0) = 4 then
    v_status := 'failed';
    v_err_msg := array_to_string(v_errors, '; ');
  elsif coalesce(array_length(v_errors, 1), 0) > 0 then
    v_status := 'partial';
    v_err_msg := array_to_string(v_errors, '; ');
  end if;

  insert into public.org_automation_runs (
    org_id, trigger_source, as_of_date,
    invoices_generated, bills_generated, depreciation_posted, prepaids_posted,
    status, details, error_message, ran_by
  ) values (
    p_org_id, p_trigger, v_as_of,
    v_inv_count, v_bill_count, v_dep_count, v_prep_count,
    v_status,
    jsonb_build_object('invoices', v_inv, 'bills', v_bill, 'depreciation', v_dep, 'prepaids', v_prep),
    v_err_msg,
    p_actor
  )
  returning id into v_run_id;

  if p_trigger = 'manual' or (v_inv_count + v_bill_count + v_dep_count + v_prep_count) > 0 or v_status <> 'ok' then
    if p_actor is not null then
      select email into v_actor_email from auth.users where id = p_actor;
    else
      v_actor_email := 'cron@kira';
    end if;
    insert into public.org_activity_log (org_id, actor_id, actor_email, action, summary, meta)
    values (
      p_org_id,
      p_actor,
      v_actor_email,
      'automation.ran',
      (case when p_trigger = 'cron' then 'Scheduled cron' else 'Manual automation' end)
        || ': ' || v_inv_count || ' inv, ' || v_bill_count || ' bill, '
        || v_dep_count || ' dep, ' || v_prep_count || ' prepaid',
      jsonb_build_object('run_id', v_run_id, 'status', v_status, 'as_of', v_as_of)
    );
  end if;

  return jsonb_build_object(
    'runId', v_run_id,
    'slug', p_slug,
    'asOf', v_as_of,
    'trigger', p_trigger,
    'status', v_status,
    'invoicesGenerated', v_inv_count,
    'billsGenerated', v_bill_count,
    'depreciationPosted', v_dep_count,
    'prepaidsPosted', v_prep_count,
    'errorMessage', v_err_msg
  );
end;
$$;

-- On-demand org automation runner for Owners / Admins / Bookkeepers.
create or replace function public.run_org_automations_now(p_slug text, p_as_of date default null) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
begin
  return public.run_org_automations_internal(v_org, p_slug, p_as_of, 'manual', auth.uid());
end;
$$;

-- System-wide cron runner (service_role / postgres ONLY).
create or replace function public.run_scheduled_automations_system(
  p_as_of date default null,
  p_slug text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_as_of date := coalesce(p_as_of, (now() at time zone 'Asia/Kuala_Lumpur')::date);
  o record;
  v_owner uuid;
  v_res jsonb;
  v_runs jsonb := '[]'::jsonb;
  v_orgs int := 0;
  v_inv int := 0;
  v_bill int := 0;
  v_dep int := 0;
  v_prep int := 0;
begin
  for o in
    select id, slug
    from public.organizations
    where auto_run_enabled = true
      and (p_slug is null or slug = p_slug)
    order by created_at asc
  loop
    select m.user_id into v_owner
    from public.organization_members m
    where m.org_id = o.id and m.role in ('owner', 'admin', 'member')
    order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, m.created_at asc
    limit 1;

    if v_owner is null then
      continue;
    end if;

    -- Establish transaction-local JWT sub so existing editor RPCs authorize cleanly for this org's owner.
    perform set_config('request.jwt.claim.sub', v_owner::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);

    v_res := public.run_org_automations_internal(o.id, o.slug, v_as_of, 'cron', null);
    v_runs := v_runs || jsonb_build_array(v_res);
    v_orgs := v_orgs + 1;
    v_inv := v_inv + coalesce((v_res->>'invoicesGenerated')::int, 0);
    v_bill := v_bill + coalesce((v_res->>'billsGenerated')::int, 0);
    v_dep := v_dep + coalesce((v_res->>'depreciationPosted')::int, 0);
    v_prep := v_prep + coalesce((v_res->>'prepaidsPosted')::int, 0);
  end loop;

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);

  return jsonb_build_object(
    'asOf', v_as_of,
    'organizationsProcessed', v_orgs,
    'totals', jsonb_build_object(
      'invoicesGenerated', v_inv,
      'billsGenerated', v_bill,
      'depreciationPosted', v_dep,
      'prepaidsPosted', v_prep
    ),
    'runs', v_runs
  );
end;
$$;

revoke all on function public.set_auto_run_enabled(text, boolean) from public, anon;
grant execute on function public.set_auto_run_enabled(text, boolean) to authenticated;

revoke all on function public.run_org_automations_internal(uuid, text, date, text, uuid) from public, anon, authenticated;

revoke all on function public.run_org_automations_now(text, date) from public, anon;
grant execute on function public.run_org_automations_now(text, date) to authenticated;

revoke all on function public.run_scheduled_automations_system(date, text) from public, anon, authenticated;
grant execute on function public.run_scheduled_automations_system(date, text) to service_role;
